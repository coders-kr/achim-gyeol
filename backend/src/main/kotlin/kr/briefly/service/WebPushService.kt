package kr.briefly.service

import kr.briefly.domain.PushSubscription
import kr.briefly.repository.PushSubscriptionRepository
import kr.briefly.repository.StoryFeedbackRepository
import kr.briefly.repository.PushDeliveryAttemptRepository
import kr.briefly.repository.ReaderEventRepository
import kr.briefly.domain.PushDeliveryAttempt
import kr.briefly.domain.DeliveryState
import kr.briefly.repository.BriefingEditionRepository
import nl.martijndwars.webpush.Notification
import nl.martijndwars.webpush.Encoding
import nl.martijndwars.webpush.PushService
import nl.martijndwars.webpush.Urgency
import org.apache.http.util.EntityUtils
import org.bouncycastle.jce.ECNamedCurveTable
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.stereotype.Component
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.module.kotlin.jacksonObjectMapper
import jakarta.annotation.PreDestroy
import java.nio.charset.StandardCharsets
import java.math.BigInteger
import java.security.MessageDigest
import java.security.Security
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.nio.charset.StandardCharsets.UTF_8
import java.time.ZoneId
import java.time.zone.ZoneRulesException
import java.util.Base64
import java.util.concurrent.Callable
import java.util.concurrent.Executors

data class PushKeys(val p256dh: String, val auth: String)
data class PushRegistration(
    val endpoint: String,
    val keys: PushKeys,
    val timezone: String,
    val deliveryHour: Int,
    val deliveryMinute: Int,
    val userAgent: String?,
)

/**
 * A device may disappear between the workflow's count snapshot and dispatch
 * (for example, an expired browser subscription). Sending to the current
 * active set is safe when it shrinks; abort if it grows so a newly registered
 * device cannot be silently missed.
 */
internal fun forcedDispatchCountIsSafe(expected: Int, current: Int): Boolean =
    expected >= 0 && current in 0..expected

internal fun deliveryAlreadyCompleted(
    state: DeliveryState?,
    lastSentAt: OffsetDateTime?,
    briefingDate: LocalDate,
    zone: ZoneId,
): Boolean = state == DeliveryState.DELIVERED ||
    lastSentAt?.atZoneSameInstant(zone)?.toLocalDate() == briefingDate

data class PushConfigResponse(val enabled: Boolean, val publicKey: String)
data class PushResult(
    val delivered: Boolean,
    val message: String,
    /** A safe operator-facing diagnostic; never contains the push endpoint. */
    val diagnostic: String? = null,
    /** Whether a short in-process retry can reasonably recover the failure. */
    val retryable: Boolean = false,
)
data class PushDeliverySummary(
    val status: String,
    val activeSubscriptions: Int,
    val dueSubscriptions: Int,
    val delivered: Int,
    val failed: Int,
    val message: String,
    /** Sanitized device/error details for the operator console only. */
    val failureReasons: List<String> = emptyList(),
)

data class WelcomePreviewStatus(
    val activeSubscriptions: Int,
    val operatorIncluded: Boolean,
    val newSubscriptions: Int,
    val totalTargets: Int,
)

private data class DeliveryOutcome(
    val due: Boolean = false,
    val delivered: Boolean = false,
    val failed: Boolean = false,
    val failureReason: String? = null,
)

internal data class WelcomePreviewTargets(
    val operator: PushSubscription?,
    val newSubscribers: List<PushSubscription>,
) {
    val all: List<PushSubscription> = listOfNotNull(operator) + newSubscribers
}

internal fun selectWelcomePreviewTargets(subscriptions: List<PushSubscription>): WelcomePreviewTargets {
    val active = subscriptions.filter(PushSubscription::active).sortedBy(PushSubscription::createdAt)
    val operator = active.firstOrNull()
    val operatorId = operator?.id
    val newSubscribers = active.filter { subscription ->
        subscription.id != operatorId &&
            subscription.lastSentAt == null &&
            subscription.onboardingPreviewSentAt == null
    }
    return WelcomePreviewTargets(operator, newSubscribers)
}

// Stored weekday numbers follow the browser convention: Sunday=0, Monday=1.
internal val allDeliveryWeekdays: Set<Int> = (1..5).toSet()
internal val allDeliveryWeekdaysValue: String = allDeliveryWeekdays.joinToString(",")
internal fun isBriefingWeekday(date: LocalDate): Boolean = date.dayOfWeek.value in 1..5
internal val fixedDeliveryTime: LocalTime = LocalTime.of(7, 30)
internal val lastDeliveryTime: LocalTime = LocalTime.of(8, 0)
internal val fixedFinalizationTime: LocalTime = LocalTime.of(6, 0)
internal fun pushStatusIsRetryable(status: Int): Boolean = status == 408 || status == 429 || status >= 500
internal fun pushEndpointIsInvalid(status: Int): Boolean = status in setOf(400, 401, 403, 404, 410)
internal data class VapidKeyResolution(val publicKey: String, val configuredPublicKeyMatchesPrivateKey: Boolean)
internal fun resolveVapidKey(configuredPublicKey: String, privateKey: String): VapidKeyResolution {
    val privateKeyBytes = decodeBase64Url(privateKey)
    require(privateKeyBytes.size == 32) { "VAPID private key must contain 32 bytes" }

    val curve = requireNotNull(ECNamedCurveTable.getParameterSpec("secp256r1")) { "P-256 curve is unavailable" }
    val scalar = BigInteger(1, privateKeyBytes)
    require(scalar.signum() > 0 && scalar < curve.n) { "VAPID private key is outside the P-256 range" }
    val derivedPublicKey = Base64.getUrlEncoder().withoutPadding()
        .encodeToString(curve.g.multiply(scalar).normalize().getEncoded(false))
    return VapidKeyResolution(
        publicKey = derivedPublicKey,
        configuredPublicKeyMatchesPrivateKey = configuredPublicKey.trim().trimEnd('=') == derivedPublicKey,
    )
}

private fun decodeBase64Url(value: String): ByteArray {
    val normalized = value.trim().trimEnd('=')
    val padding = "=".repeat((4 - normalized.length % 4) % 4)
    return Base64.getUrlDecoder().decode(normalized + padding)
}

internal fun deliveryIsDue(current: LocalTime, scheduled: LocalTime = fixedDeliveryTime): Boolean =
    !current.isBefore(scheduled) && !current.isAfter(lastDeliveryTime)

internal fun deliveryFallbackIsRequired(briefingDate: LocalDate?, today: LocalDate, current: LocalTime): Boolean =
    isBriefingWeekday(today) && briefingDate != today && deliveryIsDue(current)

internal fun parseFinalizationTime(value: String): LocalTime =
    runCatching { LocalTime.parse(value.trim()) }.getOrDefault(fixedFinalizationTime)

internal fun finalizationIsComplete(
    lastVerifiedAt: OffsetDateTime?,
    now: OffsetDateTime,
    finalizationTime: LocalTime = fixedFinalizationTime,
    zone: ZoneId = ZoneId.of("Asia/Seoul"),
): Boolean {
    val cutoff = now.atZoneSameInstant(zone).toLocalDate()
        .atTime(finalizationTime)
        .atZone(zone)
        .toInstant()
    return lastVerifiedAt?.toInstant()?.let { !it.isBefore(cutoff) } == true
}

@Service
class WebPushService(
    private val repository: PushSubscriptionRepository,
    private val briefingService: BriefingService,
    private val newsBriefingGenerator: NewsBriefingGenerator,
    private val briefingEditionRepository: BriefingEditionRepository,
    private val metricsService: SubscriptionMetricsService,
    private val deliveryAttemptRepository: PushDeliveryAttemptRepository,
    @Value("\${app.push.enabled:false}") private val enabled: Boolean,
    @Value("\${app.push.public-key:}") private val publicKey: String,
    @Value("\${app.push.private-key:}") private val privateKey: String,
    @Value("\${app.push.subject:https://morningnews.coders.kr}") private val subject: String,
    @Value("\${app.push.public-url:https://morningnews.coders.kr}") private val publicUrl: String,
    @Value("\${app.pipeline.finalization-time:07:00}") finalizationTimeValue: String,
    @Value("\${app.push.delivery-concurrency:16}") deliveryConcurrencyValue: Int,
) {
    private val logger = LoggerFactory.getLogger(javaClass)
    private val mapper = jacksonObjectMapper()
    private val vapidKey = runCatching { resolveVapidKey(publicKey, privateKey) }.getOrNull()
    private val finalizationTime = parseFinalizationTime(finalizationTimeValue)
    private val deliveryConcurrency = deliveryConcurrencyValue.coerceIn(4, 32)
    private val deliveryExecutor = Executors.newFixedThreadPool(deliveryConcurrency)

    @PreDestroy
    fun shutdownDeliveryExecutor() {
        deliveryExecutor.shutdownNow()
    }

    init {
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) Security.addProvider(BouncyCastleProvider())
        if (enabled && privateKey.isNotBlank() && vapidKey == null) {
            logger.error("Web push is disabled because the VAPID private key is invalid")
        } else if (enabled && vapidKey?.configuredPublicKeyMatchesPrivateKey == false) {
            // A mismatched pair produces provider HTTP 401/403 even though browser
            // permission and subscription creation both succeed. The private key is
            // the signing authority, so derive its public half and use it everywhere.
            logger.warn("Configured VAPID public key does not match the private key; using the derived public key")
        }
    }

    fun config() = PushConfigResponse(isConfigured(), if (isConfigured()) vapidKey!!.publicKey else "")

    @Transactional(readOnly = true)
    fun subscriptionStatus(ownerId: String, endpoint: String): PushSubscription? =
        repository.findByEndpointHash(endpointHash(endpoint))?.takeIf { it.ownerId == ownerId }

    @Transactional
    fun subscribe(ownerId: String, registration: PushRegistration): PushSubscription {
        requireConfigured()
        require(registration.endpoint.startsWith("https://")) { "올바른 푸시 구독 주소가 아닙니다." }
        require(registration.deliveryHour in 0..23 && registration.deliveryMinute in 0..59) { "발송 시간이 올바르지 않습니다." }
        try { ZoneId.of(registration.timezone) } catch (_: ZoneRulesException) { throw IllegalArgumentException("시간대가 올바르지 않습니다.") }

        val hash = endpointHash(registration.endpoint)
        val subscription = repository.findByEndpointHash(hash) ?: PushSubscription(
            ownerId = ownerId,
            endpointHash = hash,
            endpoint = registration.endpoint,
            p256dh = registration.keys.p256dh,
            auth = registration.keys.auth,
        )
        subscription.ownerId = ownerId
        subscription.endpoint = registration.endpoint
        subscription.p256dh = registration.keys.p256dh
        subscription.auth = registration.keys.auth
        // 아침결은 모든 독자에게 같은 한국 시간 기준 브리핑을 보냅니다.
        // 예전 프런트엔드가 임의 시간을 보내도 서버에서 07:30으로 정규화합니다.
        subscription.timezone = "Asia/Seoul"
        subscription.deliveryHour = fixedDeliveryTime.hour
        subscription.deliveryMinute = fixedDeliveryTime.minute
        subscription.weekdays = allDeliveryWeekdaysValue
        subscription.userAgent = registration.userAgent?.take(500)
        subscription.active = true
        subscription.updatedAt = OffsetDateTime.now()
        subscription.lastError = null
        val saved = repository.saveAndFlush(subscription)
        metricsService.recordIfChanged("SUBSCRIPTION_REGISTERED")
        return saved
    }

    @Transactional
    fun unsubscribe(ownerId: String, endpoint: String) {
        repository.findByEndpointHash(endpointHash(endpoint))?.takeIf { it.ownerId == ownerId && it.active }?.let {
            repository.delete(it)
            repository.flush()
            metricsService.recordIfChanged("SUBSCRIPTION_UNSUBSCRIBED")
        }
    }

    @Transactional
    fun sendTest(ownerId: String, endpoint: String): PushResult {
        requireConfigured()
        val subscription = repository.findByEndpointHash(endpointHash(endpoint))
            ?.takeIf { it.active && it.ownerId == ownerId } ?: return PushResult(false, "이 계정의 활성 구독을 찾을 수 없습니다.")
        val briefing = runCatching { briefingService.latest() }.getOrNull()
        val count = briefing?.stories?.size ?: 0
        return sendWithRetry(
            subscription,
            title = "[운영자 테스트] 아침결 알림",
            body = if (count > 0) "연결 확인 완료 · 뉴스 카드 ${count}건을 열어볼 수 있어요." else "웹푸시 연결이 정상적으로 완료됐어요.",
            test = true,
        )
    }

    @Scheduled(cron = "0 * * * * MON-FRI", zone = "Asia/Seoul")
    fun deliverScheduledBriefings() {
        deliverDueBriefings()
    }

    @Synchronized
    fun deliverDueBriefings(): PushDeliverySummary {
        if (!isConfigured()) return PushDeliverySummary("PUSH_DISABLED", 0, 0, 0, 0, "웹 푸시가 설정되지 않았습니다.")
        val today = LocalDate.now(ZoneId.of("Asia/Seoul"))
        if (!isBriefingWeekday(today)) {
            return PushDeliverySummary("WEEKEND_SKIPPED", repository.countByActiveTrue().toInt(), 0, 0, 0, "주말에는 정기 브리핑을 발송하지 않습니다.")
        }
        val currentTime = OffsetDateTime.now(ZoneId.of("Asia/Seoul")).toLocalTime()
        var briefing = runCatching { briefingService.latest() }.getOrNull()
        if (deliveryFallbackIsRequired(briefing?.briefingDate, today, currentTime)) {
            runCatching {
                newsBriefingGenerator.persistUnavailableEdition(
                    today,
                    "07:30 발송 시점까지 오늘자 에디션이 없어 자동 안내판을 생성했습니다.",
                )
            }.onFailure { logger.error("Could not create the on-time delivery fallback edition", it) }
            briefing = runCatching { briefingService.latest() }.getOrNull()
        }
        if (briefing == null) {
            logger.info("Push delivery skipped: briefing is not available")
            return PushDeliverySummary("BRIEFING_UNAVAILABLE", repository.findAllByActiveTrue().size, 0, 0, 0, "발송할 브리핑이 없습니다.")
        }
        if (briefing.briefingDate != today || !briefing.productionReady) {
            logger.info("Push delivery skipped: today's pipeline-generated briefing is not ready")
            return PushDeliverySummary("BRIEFING_NOT_READY", repository.findAllByActiveTrue().size, 0, 0, 0, "오늘의 실제 브리핑이 아직 준비되지 않았습니다.")
        }
        val edition = briefingEditionRepository.findByBriefingDate(today)
        val finalizationComplete = finalizationIsComplete(
            edition?.lastVerifiedAt,
            OffsetDateTime.now(ZoneId.of("Asia/Seoul")),
            finalizationTime,
        )
        if (!finalizationComplete) {
            val currentTime = OffsetDateTime.now(ZoneId.of("Asia/Seoul")).toLocalTime()
            if (!deliveryIsDue(currentTime)) {
                logger.info("Push delivery skipped: the final morning briefing pass has not completed yet (cutoff={})", finalizationTime)
                return PushDeliverySummary("BRIEFING_FINALIZING", repository.findAllByActiveTrue().size, 0, 0, 0, "최종 브리핑 검토가 끝난 뒤 발송합니다.")
            }
            // 정시성을 우선한다. 07:30까지 최종 라운드가 끝나지 않으면
            // 직전 시간대에 완료된 검증본을 보내고, 늦은 최종화는 웹 화면에 반영한다.
            logger.error("Final morning briefing pass missed the cutoff; sending the latest completed edition on time")
        }
        val subscriptions = repository.findAllByActiveTrue()
        val attemptsBySubscription = deliveryAttemptRepository.findAllByEditionId(briefing.id).associateBy { it.subscriptionId }
        val lead = briefing.stories.firstOrNull()
        val body = lead?.let { "${it.category} 1순위 · ${it.oneLineSummary.take(82)}" }
            ?: "오늘은 자동 검증을 통과한 뉴스 카드가 아직 없습니다. 수집과 검증을 계속 진행하고 있어요."
        val title = if (briefing.stories.isEmpty()) "아침결 · 오늘 브리핑 안내"
        else "아침결 · 어제 핵심 ${briefing.stories.size}건 · 약 ${briefing.readMinutes}분"
        val outcomes = fanOut(subscriptions) delivery@{ subscription ->
            val zone = runCatching { ZoneId.of(subscription.timezone) }.getOrDefault(ZoneId.of("Asia/Seoul"))
            val now = OffsetDateTime.now(zone)
            val subscriptionId = requireNotNull(subscription.id)
            val attempt = attemptsBySubscription[subscriptionId]
                ?: PushDeliveryAttempt(editionId = briefing.id, subscriptionId = subscriptionId)
            val alreadySentToday = deliveryAlreadyCompleted(attempt.state, subscription.lastSentAt, now.toLocalDate(), zone)
            val retryable = attempt.state in setOf(DeliveryState.PENDING, DeliveryState.FAILED) && attempt.attempts < 3
            if (!deliveryIsDue(now.toLocalTime(), fixedDeliveryTime) || alreadySentToday || !retryable) return@delivery DeliveryOutcome()
            attempt.attempts += 1
            attempt.lastAttemptAt = OffsetDateTime.now()
            val result = send(subscription, title, body, false)
            val outcome = if (result.delivered) {
                attempt.state = DeliveryState.DELIVERED
                attempt.deliveredAt = OffsetDateTime.now()
                attempt.error = null
                DeliveryOutcome(due = true, delivered = true)
            } else {
                attempt.state = if (subscription.active) DeliveryState.FAILED else DeliveryState.EXPIRED
                attempt.error = subscription.lastError?.take(600) ?: result.message.take(600)
                DeliveryOutcome(due = true, failed = true, failureReason = failureReason(subscription, result))
            }
            deliveryAttemptRepository.save(attempt)
            outcome
        }
        val due = outcomes.count { it.due }
        val delivered = outcomes.count { it.delivered }
        val failed = outcomes.count { it.failed }
        // Keep operator responses bounded even if a provider outage affects the
        // entire audience; aggregate counts still describe the full fan-out.
        val failureReasons = outcomes.mapNotNull { it.failureReason }.take(MAX_FAILURE_REASONS)
        return PushDeliverySummary(
            if (finalizationComplete) "COMPLETED" else "COMPLETED_WITH_DEADLINE_FALLBACK",
            subscriptions.size,
            due,
            delivered,
            failed,
            if (finalizationComplete) "오늘 브리핑 발송 검사를 완료했습니다." else "최종화가 지연되어 마지막 완료본을 정시에 발송했습니다.",
            failureReasons,
        )
    }

    fun activeSubscriptionCount(): Int = repository.countByActiveTrue().toInt()

    @Synchronized
    fun deliverLatestToAll(expectedBriefingDate: LocalDate, expectedActiveSubscriptions: Int): PushDeliverySummary {
        requireConfigured()
        val today = LocalDate.now(ZoneId.of("Asia/Seoul"))
        require(expectedBriefingDate == today) {
            "전체 발송 기준일이 오늘과 다릅니다. 예상 $expectedBriefingDate, 오늘 $today"
        }
        val briefing = briefingService.latest()
        require(briefing.briefingDate == expectedBriefingDate && briefing.productionReady) {
            "오늘의 재생성 브리핑이 발송 가능한 상태가 아닙니다"
        }
        val subscriptions = repository.findAllByActiveTrue()
        require(forcedDispatchCountIsSafe(expectedActiveSubscriptions, subscriptions.size)) {
            "등록 기기 수가 예상과 다릅니다. 예상 ${expectedActiveSubscriptions}대, 현재 ${subscriptions.size}대"
        }
        if (subscriptions.size < expectedActiveSubscriptions) {
            logger.warn(
                "Forced delivery snapshot shrank before dispatch; sending to current active devices: expected={}, current={}",
                expectedActiveSubscriptions,
                subscriptions.size,
            )
        }

        val lead = briefing.stories.firstOrNull()
        val title = "[다시 보내드림] 아침결 · 어제 핵심 ${briefing.stories.size}건"
        val body = lead?.let { "${it.category} 1순위 · ${it.oneLineSummary.take(82)}" }
            ?: "오늘 브리핑을 다시 점검해 보내드립니다."
        val attemptsBySubscription = deliveryAttemptRepository.findAllByEditionId(briefing.id).associateBy { it.subscriptionId }
        val outcomes = fanOut(subscriptions) { subscription ->
            val subscriptionId = requireNotNull(subscription.id)
            val attempt = attemptsBySubscription[subscriptionId]
                ?: PushDeliveryAttempt(editionId = briefing.id, subscriptionId = subscriptionId)
            attempt.attempts += 1
            attempt.lastAttemptAt = OffsetDateTime.now()
            val result = send(subscription, title, body, false)
            val outcome = if (result.delivered) {
                attempt.state = DeliveryState.DELIVERED
                attempt.deliveredAt = OffsetDateTime.now()
                attempt.error = null
                DeliveryOutcome(due = true, delivered = true)
            } else {
                attempt.state = if (subscription.active) DeliveryState.FAILED else DeliveryState.EXPIRED
                attempt.error = subscription.lastError?.take(600) ?: result.message.take(600)
                DeliveryOutcome(due = true, failed = true, failureReason = failureReason(subscription, result))
            }
            deliveryAttemptRepository.save(attempt)
            outcome
        }
        val delivered = outcomes.count { it.delivered }
        val failed = outcomes.count { it.failed }
        val failureReasons = outcomes.mapNotNull { it.failureReason }.take(MAX_FAILURE_REASONS)
        return PushDeliverySummary(
            status = if (failed == 0) "FORCED_DELIVERY_COMPLETED" else "FORCED_DELIVERY_PARTIAL_FAILURE",
            activeSubscriptions = subscriptions.size,
            dueSubscriptions = subscriptions.size,
            delivered = delivered,
            failed = failed,
            message = "오늘 브리핑을 기존 발송 여부에 관계없이 전체 활성 기기에 보냈습니다.",
            failureReasons = failureReasons,
        )
    }

    /**
     * Recovers a missed morning run without sending a duplicate to devices that
     * already received this edition. This endpoint is safe for redundant
     * watchdogs: every invocation re-checks the persisted delivery attempt and
     * the subscription's last successful delivery date before sending.
     */
    @Synchronized
    fun recoverMissedDelivery(expectedBriefingDate: LocalDate, expectedActiveSubscriptions: Int): PushDeliverySummary {
        requireConfigured()
        val today = LocalDate.now(ZoneId.of("Asia/Seoul"))
        require(expectedBriefingDate == today) {
            "누락 발송 복구 기준일이 오늘과 다릅니다. 예상 $expectedBriefingDate, 오늘 $today"
        }
        val briefing = briefingService.latest()
        require(briefing.briefingDate == today && briefing.productionReady) {
            "오늘의 브리핑이 아직 복구 발송 가능한 상태가 아닙니다"
        }
        val subscriptions = repository.findAllByActiveTrue()
        require(forcedDispatchCountIsSafe(expectedActiveSubscriptions, subscriptions.size)) {
            "등록 기기 수가 예상과 다릅니다. 예상 ${expectedActiveSubscriptions}대, 현재 ${subscriptions.size}대"
        }

        val lead = briefing.stories.firstOrNull()
        val title = if (briefing.stories.isEmpty()) {
            "아침결 · 오늘 브리핑 안내"
        } else {
            "아침결 · 어제 핵심 ${briefing.stories.size}건 · 약 ${briefing.readMinutes}분"
        }
        val body = lead?.let { "${it.category} 1순위 · ${it.oneLineSummary.take(82)}" }
            ?: "오늘은 자동 검증을 통과한 뉴스 카드가 아직 없습니다. 수집과 검증을 계속 진행하고 있어요."
        val attemptsBySubscription = deliveryAttemptRepository.findAllByEditionId(briefing.id).associateBy { it.subscriptionId }
        val outcomes = fanOut(subscriptions) delivery@{ subscription ->
            val zone = runCatching { ZoneId.of(subscription.timezone) }.getOrDefault(ZoneId.of("Asia/Seoul"))
            val subscriptionId = requireNotNull(subscription.id)
            val attempt = attemptsBySubscription[subscriptionId]
                ?: PushDeliveryAttempt(editionId = briefing.id, subscriptionId = subscriptionId)
            if (deliveryAlreadyCompleted(attempt.state, subscription.lastSentAt, today, zone)) return@delivery DeliveryOutcome()
            if (attempt.attempts >= 5) {
                return@delivery DeliveryOutcome(
                    due = true,
                    failed = true,
                    failureReason = "${classifyDeviceClient(subscription.userAgent).deviceType}: 복구 재시도 한도 초과",
                )
            }
            attempt.attempts += 1
            attempt.lastAttemptAt = OffsetDateTime.now()
            val result = send(subscription, title, body, false)
            val outcome = if (result.delivered) {
                attempt.state = DeliveryState.DELIVERED
                attempt.deliveredAt = OffsetDateTime.now()
                attempt.error = null
                DeliveryOutcome(due = true, delivered = true)
            } else {
                attempt.state = if (subscription.active) DeliveryState.FAILED else DeliveryState.EXPIRED
                attempt.error = subscription.lastError?.take(600) ?: result.message.take(600)
                DeliveryOutcome(due = true, failed = true, failureReason = failureReason(subscription, result))
            }
            deliveryAttemptRepository.save(attempt)
            outcome
        }
        val due = outcomes.count { it.due }
        val delivered = outcomes.count { it.delivered }
        val failed = outcomes.count { it.failed }
        val failureReasons = outcomes.mapNotNull { it.failureReason }.take(MAX_FAILURE_REASONS)

        return PushDeliverySummary(
            status = when {
                failed > 0 -> "RECOVERY_PARTIAL_FAILURE"
                due == 0 -> "RECOVERY_NOT_NEEDED"
                else -> "RECOVERY_COMPLETED"
            },
            activeSubscriptions = subscriptions.size,
            dueSubscriptions = due,
            delivered = delivered,
            failed = failed,
            message = if (due == 0) "오늘 브리핑은 모든 활성 기기에 이미 발송됐습니다."
            else "오늘 브리핑을 아직 받지 못한 활성 기기에만 복구 발송했습니다.",
            failureReasons = failureReasons,
        )
    }

    /**
     * Push providers are network-bound. A bounded pool keeps one slow endpoint
     * from serialising the entire morning delivery while protecting the DB and
     * provider from an unbounded fan-out.
     */
    private fun fanOut(
        subscriptions: List<PushSubscription>,
        action: (PushSubscription) -> DeliveryOutcome,
    ): List<DeliveryOutcome> {
        val outcomes = mutableListOf<DeliveryOutcome>()
        // Submit a bounded batch at a time so a large audience does not turn
        // into tens of thousands of queued futures or exhaust provider/DB
        // resources before the first results are persisted.
        subscriptions.chunked((deliveryConcurrency * 8).coerceAtLeast(32)).forEach { batch ->
            val futures = batch.map { subscription ->
                deliveryExecutor.submit(Callable { action(subscription) })
            }
            futures.forEachIndexed { index, future ->
                try {
                    outcomes += future.get()
                } catch (interrupted: InterruptedException) {
                    Thread.currentThread().interrupt()
                    logger.error("Push delivery worker interrupted (index={})", index, interrupted)
                    outcomes += DeliveryOutcome(due = true, failed = true, failureReason = "발송 작업이 중단됐습니다")
                } catch (exception: Exception) {
                    logger.error("Push delivery worker failed (index={})", index, exception)
                    outcomes += DeliveryOutcome(due = true, failed = true, failureReason = "발송 작업 처리 중 오류가 발생했습니다")
                }
            }
        }
        return outcomes
    }

    @Transactional(readOnly = true)
    fun welcomePreviewStatus(): WelcomePreviewStatus {
        val activeSubscriptions = repository.findAllByActiveTrue()
        val targets = selectWelcomePreviewTargets(activeSubscriptions)
        return WelcomePreviewStatus(
            activeSubscriptions = activeSubscriptions.size,
            operatorIncluded = targets.operator != null,
            newSubscriptions = targets.newSubscribers.size,
            totalTargets = targets.all.size,
        )
    }

    @Transactional
    @Synchronized
    fun retryFailedDeliveries(editionId: Long): PushDeliverySummary {
        requireConfigured()
        val briefing = briefingService.latest()
        require(briefing.id == editionId) { "최신 브리핑의 실패 발송만 재시도할 수 있습니다" }
        val attempts = deliveryAttemptRepository.findAllByEditionIdAndState(editionId, DeliveryState.FAILED)
        var delivered = 0
        var failed = 0
        val failureReasons = mutableListOf<String>()
        attempts.forEach { attempt ->
            val subscription = repository.findById(attempt.subscriptionId).orElse(null)
            if (subscription == null || !subscription.active || attempt.attempts >= 5) return@forEach
            attempt.attempts += 1
            attempt.lastAttemptAt = OffsetDateTime.now()
            val result = send(subscription, "[재전송] 아침결 · 오늘 뉴스 ${briefing.stories.size}건", "실패했던 오늘 브리핑을 다시 보내드립니다.", false)
            if (result.delivered) {
                delivered += 1; attempt.state = DeliveryState.DELIVERED; attempt.deliveredAt = OffsetDateTime.now(); attempt.error = null
            } else {
                failed += 1; attempt.error = subscription.lastError ?: result.message
                failureReasons += failureReason(subscription, result)
            }
            deliveryAttemptRepository.save(attempt)
        }
        return PushDeliverySummary(
            "RETRY_COMPLETED",
            repository.countByActiveTrue().toInt(),
            attempts.size,
            delivered,
            failed,
            "실패한 발송만 안전하게 재시도했습니다.",
            failureReasons,
        )
    }

    @Transactional
    fun sendOperatorTestToActive(expectedActiveSubscriptions: Int): PushDeliverySummary {
        requireConfigured()
        val subscriptions = repository.findAllByActiveTrue()
        require(subscriptions.size == expectedActiveSubscriptions) {
            "등록 기기 수가 예상과 다릅니다. 예상 ${expectedActiveSubscriptions}대, 현재 ${subscriptions.size}대"
        }
        var delivered = 0
        var failed = 0
        val failureReasons = mutableListOf<String>()
        subscriptions.forEach { subscription ->
            val result = send(
                subscription,
                title = "[운영자 테스트] 아침결 신뢰 브리핑",
                body = "한 줄 결론·확인된 핵심·근거 출처가 연결된 새 뉴스 카드를 확인해 보세요.",
                test = true,
            )
            if (result.delivered) delivered += 1 else {
                failed += 1
                failureReasons += failureReason(subscription, result)
            }
        }
        return PushDeliverySummary(
            status = if (failed == 0) "TEST_COMPLETED" else "TEST_PARTIAL_FAILURE",
            activeSubscriptions = subscriptions.size,
            dueSubscriptions = subscriptions.size,
            delivered = delivered,
            failed = failed,
            message = "운영자 테스트 알림을 발송했습니다. 정기 브리핑 발송 기록에는 반영하지 않았습니다.",
            failureReasons = failureReasons,
        )
    }

    @Transactional
    @Synchronized
    fun sendWelcomePreview(expectedNewSubscriptions: Int, expectedTotalSubscriptions: Int): PushDeliverySummary {
        requireConfigured()
        val activeSubscriptions = repository.findAllByActiveTrue()
        val targets = selectWelcomePreviewTargets(activeSubscriptions)
        require(targets.newSubscribers.size == expectedNewSubscriptions) {
            "신규 안내 대상 수가 예상과 다릅니다. 예상 ${expectedNewSubscriptions}대, 현재 ${targets.newSubscribers.size}대"
        }
        require(targets.all.size == expectedTotalSubscriptions) {
            "전체 안내 대상 수가 예상과 다릅니다. 예상 ${expectedTotalSubscriptions}대, 현재 ${targets.all.size}대"
        }

        val briefing = runCatching { briefingService.latest() }.getOrNull()
        val storyCount = briefing?.stories?.size ?: 0
        val title = "아침결 · 내일부터 이렇게 도착해요"
        val body = if (storyCount > 0) {
            "평일 오전 7시 30분, 전날 핵심 뉴스 ${storyCount}건을 카드로 정리해드려요. 눌러서 오늘 브리핑을 확인해보세요."
        } else {
            "평일 오전 7시 30분, 전날 꼭 알아야 할 뉴스를 검토해 카드로 정리해드려요."
        }

        var delivered = 0
        var failed = 0
        val failureReasons = mutableListOf<String>()
        targets.all.forEach { subscription ->
            val result = send(subscription, title, body, true)
            if (result.delivered) {
                delivered += 1
                subscription.onboardingPreviewSentAt = OffsetDateTime.now()
                repository.save(subscription)
            } else {
                failed += 1
                failureReasons += failureReason(subscription, result)
            }
        }

        return PushDeliverySummary(
            status = if (failed == 0) "WELCOME_PREVIEW_COMPLETED" else "WELCOME_PREVIEW_PARTIAL_FAILURE",
            activeSubscriptions = activeSubscriptions.size,
            dueSubscriptions = targets.all.size,
            delivered = delivered,
            failed = failed,
            message = "운영자 기기와 신규 구독 기기에 뉴스 수신 안내를 보냈습니다.",
            failureReasons = failureReasons,
        )
    }

    private fun send(subscription: PushSubscription, title: String, body: String, test: Boolean): PushResult =
        sendWithRetry(subscription, title, body, test)

    private fun sendWithRetry(
        subscription: PushSubscription,
        title: String,
        body: String,
        test: Boolean,
        maxAttempts: Int = 3,
    ): PushResult {
        var attempt = 1
        var result = sendOnce(subscription, title, body, test)
        while (!result.delivered && result.retryable && subscription.active && attempt < maxAttempts) {
            // Provider/network hiccups are common during a fan-out. A bounded, short
            // retry prevents a single transient failure from looking like a missed briefing.
            Thread.sleep(250L * attempt)
            attempt += 1
            result = sendOnce(subscription, title, body, test)
        }
        return result
    }

    private fun failureReason(subscription: PushSubscription, result: PushResult): String {
        val client = classifyDeviceClient(subscription.userAgent)
        val detail = result.diagnostic ?: result.message
        return "${client.deviceType}/${client.browser}: ${detail.take(240)}"
    }

    private fun sendOnce(subscription: PushSubscription, title: String, body: String, test: Boolean): PushResult = try {
        val payload = mapper.writeValueAsString(mapOf(
            "title" to title,
            "body" to body,
            "url" to "${publicUrl.trimEnd('/')}/briefing/",
            "tag" to if (test) "achim-gyeol-test" else "achim-gyeol-daily",
        ))
        val notification = Notification(subscription.endpoint, subscription.p256dh, subscription.auth, payload, Urgency.NORMAL)
        // web-push 5.1.2 still defaults the synchronous send(notification) API to
        // legacy AESGCM. Modern Chrome/FCM subscriptions require RFC 8188
        // AES128GCM, so always select it explicitly.
        val response = PushService(vapidKey!!.publicKey, privateKey, subject)
            .send(notification, WEB_PUSH_CONTENT_ENCODING)
        val status = response.statusLine.statusCode
        if (status in 200..299) {
            // An operator test proves the device connection only. It must not consume
            // the subscriber's once-per-day production delivery slot.
            if (!test) subscription.lastSentAt = OffsetDateTime.now()
            subscription.lastError = null
            repository.save(subscription)
            PushResult(true, "푸시 알림을 발송했습니다.")
        } else {
            // 400/404/410 mean an invalid or expired endpoint. 401/403 mean the
            // endpoint was created with older VAPID credentials. All require the
            // browser to register a fresh subscription; repeating cannot recover.
            val endpointExpired = subscription.active && pushEndpointIsInvalid(status)
            if (endpointExpired) {
                subscription.active = false
                subscription.updatedAt = OffsetDateTime.now()
            }
            val providerDiagnostic = safeProviderDiagnostic(
                status,
                runCatching { response.entity?.let { EntityUtils.toString(it, UTF_8) } }.getOrNull(),
            )
            logger.warn("Web push provider rejected request: {}", providerDiagnostic)
            subscription.lastError = "Push provider returned $providerDiagnostic"
            repository.saveAndFlush(subscription)
            if (endpointExpired) metricsService.recordIfChanged("PUSH_ENDPOINT_EXPIRED")
            PushResult(
                delivered = false,
                message = "푸시 제공자가 발송을 거절했습니다. (HTTP $status)",
                diagnostic = providerDiagnostic,
                retryable = pushStatusIsRetryable(status),
            )
        }
    } catch (exception: Exception) {
        logger.warn("Web push delivery failed: {}", exception.message)
        subscription.lastError = safeExceptionDiagnostic(exception)
        repository.save(subscription)
        PushResult(
            delivered = false,
            message = "푸시 발송 중 오류가 발생했습니다.",
            diagnostic = subscription.lastError,
            retryable = true,
        )
    }

    private fun safeProviderDiagnostic(status: Int, responseBody: String?): String =
        providerResponseDiagnostic(status, responseBody)

    private fun safeExceptionDiagnostic(exception: Exception): String {
        val detail = exception.message.orEmpty()
            .replace(Regex("https?://\\S+"), "<redacted-url>")
            .replace(Regex("[\\r\\n\\t]+"), " ")
            .trim()
        return "${exception::class.simpleName ?: "Exception"}${if (detail.isBlank()) "" else ": $detail"}".take(600)
    }

    private fun isConfigured() = enabled && privateKey.isNotBlank() && vapidKey != null
    private fun requireConfigured() = check(isConfigured()) { "웹푸시가 아직 설정되지 않았습니다." }

    companion object {
        private const val MAX_FAILURE_REASONS = 100

        fun endpointHash(endpoint: String): String = MessageDigest.getInstance("SHA-256")
            .digest(endpoint.toByteArray(StandardCharsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }
}

internal val WEB_PUSH_CONTENT_ENCODING: Encoding = Encoding.AES128GCM

internal fun providerResponseDiagnostic(status: Int, responseBody: String?): String {
    val detail = responseBody.orEmpty()
        .replace(Regex("https?://\\S+"), "<redacted-url>")
        .replace(Regex("[\\r\\n\\t]+"), " ")
        .replace(Regex("\\s{2,}"), " ")
        .trim()
        .take(240)
    return "HTTP $status${if (detail.isBlank()) "" else ": $detail"}"
}

@Component
class PersonalDataRetentionCleanup(
    private val pushRepository: PushSubscriptionRepository,
    private val feedbackRepository: StoryFeedbackRepository,
    private val readerEventRepository: ReaderEventRepository,
) {
    private val logger = LoggerFactory.getLogger(javaClass)

    @Scheduled(cron = "0 30 3 * * *", zone = "Asia/Seoul")
    @Transactional
    fun deleteExpiredRecords() {
        val now = OffsetDateTime.now(ZoneId.of("Asia/Seoul"))
        val inactiveSubscriptions = pushRepository.findAllByActiveFalseAndUpdatedAtBefore(now.minusDays(30))
        val expiredFeedback = feedbackRepository.findAllByCreatedAtBefore(now.minusDays(90))
        val expiredReaderEvents = readerEventRepository.findAllByCreatedAtBefore(now.minusDays(90))
        if (inactiveSubscriptions.isNotEmpty()) pushRepository.deleteAllInBatch(inactiveSubscriptions)
        if (expiredFeedback.isNotEmpty()) feedbackRepository.deleteAllInBatch(expiredFeedback)
        if (expiredReaderEvents.isNotEmpty()) readerEventRepository.deleteAllInBatch(expiredReaderEvents)
        if (inactiveSubscriptions.isNotEmpty() || expiredFeedback.isNotEmpty() || expiredReaderEvents.isNotEmpty()) {
            logger.info("Deleted {} inactive push subscription(s), {} expired feedback record(s), and {} reader event(s)", inactiveSubscriptions.size, expiredFeedback.size, expiredReaderEvents.size)
        }
    }
}

@Component
class RejectedPushSubscriptionCleanup(
    private val repository: PushSubscriptionRepository,
) : ApplicationRunner {
    private val logger = LoggerFactory.getLogger(javaClass)

    @Transactional
    override fun run(args: ApplicationArguments) {
        val rejected = repository.findAllByActiveFalseAndLastError("Push provider returned HTTP 403")
        if (rejected.isEmpty()) return

        // These endpoints have already been rejected by the push provider and
        // deactivated. Removing only those rows leaves every active reader
        // untouched and lets the affected browser register a clean endpoint.
        repository.deleteAllInBatch(rejected)
        logger.info("Deleted {} inactive push subscription(s) rejected with HTTP 403", rejected.size)
    }
}

@Component
class DefaultDeliveryTimeMigration(private val repository: PushSubscriptionRepository) : ApplicationRunner {
    private val logger = LoggerFactory.getLogger(javaClass)

    @Transactional
    override fun run(args: ApplicationArguments) {
        val migrated = repository.findAllByActiveTrue().filter {
            it.timezone != "Asia/Seoul" || it.deliveryHour != fixedDeliveryTime.hour || it.deliveryMinute != fixedDeliveryTime.minute || it.weekdays != allDeliveryWeekdaysValue
        }
        migrated.forEach {
            it.timezone = "Asia/Seoul"
            it.deliveryHour = fixedDeliveryTime.hour
            it.deliveryMinute = fixedDeliveryTime.minute
            it.weekdays = allDeliveryWeekdaysValue
            it.updatedAt = OffsetDateTime.now()
        }
        if (migrated.isNotEmpty()) repository.saveAll(migrated)
        logger.info("Migrated {} push subscription(s) to weekday 07:30 Asia/Seoul delivery", migrated.size)
    }
}
