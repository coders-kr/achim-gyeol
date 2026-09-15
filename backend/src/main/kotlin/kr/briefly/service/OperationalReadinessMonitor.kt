package kr.briefly.service

import kr.briefly.domain.EditorialAuditLog
import kr.briefly.domain.EditorialState
import kr.briefly.repository.BriefingEditionRepository
import kr.briefly.repository.EditorialAuditLogRepository
import kr.briefly.repository.PushSubscriptionRepository
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId

@Component
class OperationalReadinessMonitor(
    private val editionRepository: BriefingEditionRepository,
    private val pushRepository: PushSubscriptionRepository,
    private val auditRepository: EditorialAuditLogRepository,
    private val coveragePolicy: BriefingCoveragePolicy,
) {
    private val logger = LoggerFactory.getLogger(javaClass)
    private val zone = ZoneId.of("Asia/Seoul")

    @Scheduled(cron = "0 45 6 * * MON-FRI", zone = "Asia/Seoul")
    @Transactional
    fun checkBriefingReadiness() {
        val today = LocalDate.now(zone)
        val edition = editionRepository.findByBriefingDate(today)
        val coverage = coveragePolicy.evaluate(edition?.stories.orEmpty())
        val publishableState = (edition?.editorialState ?: EditorialState.AUTO_APPROVED) in setOf(EditorialState.AUTO_APPROVED, EditorialState.APPROVED, EditorialState.PUBLISHED)
        val ready = edition?.pipelineGenerated == true && publishableState
        val deliverable = ready && coverage.ready
        val action = if (deliverable) "READINESS_CONFIRMED" else "READINESS_ALERT"
        if (!auditRepository.existsByActionAndCreatedAtAfter(action, OffsetDateTime.now(zone).toLocalDate().atStartOfDay(zone).toOffsetDateTime())) {
            auditRepository.save(EditorialAuditLog(action, "EDITION", edition?.id, "SYSTEM", "date=$today; stories=${coverage.storyCount}; categories=${coverage.categoryCount}; reasons=${coverage.reasons.joinToString()}"))
        }
        if (deliverable && coverage.targetMet) logger.info("Morning briefing readiness confirmed: date={}, stories={}", today, edition?.stories?.size)
        else if (deliverable) logger.warn("Morning briefing will be delivered below the soft coverage target: date={}, reasons={}", today, coverage.reasons.joinToString())
        else logger.error("Morning briefing is not ready at 06:45 KST because no verified cards exist: date={}, reasons={}", today, coverage.reasons.joinToString())
    }

    @Scheduled(cron = "0 20 7 * * MON-FRI", zone = "Asia/Seoul")
    @Transactional
    fun checkDeliveryReadiness() {
        val today = LocalDate.now(zone)
        val edition = editionRepository.findByBriefingDate(today)
        val active = pushRepository.countByActiveTrue()
        val coverage = coveragePolicy.evaluate(edition?.stories.orEmpty())
        val publishableState = (edition?.editorialState ?: EditorialState.AUTO_APPROVED) in setOf(EditorialState.AUTO_APPROVED, EditorialState.APPROVED, EditorialState.PUBLISHED)
        val ready = edition?.pipelineGenerated == true && publishableState
        val deliverable = ready && coverage.ready
        val action = if (deliverable) "DELIVERY_READY" else "DELIVERY_BLOCKED"
        if (!auditRepository.existsByActionAndCreatedAtAfter(action, OffsetDateTime.now(zone).toLocalDate().atStartOfDay(zone).toOffsetDateTime())) {
            auditRepository.save(EditorialAuditLog(action, "EDITION", edition?.id, "SYSTEM", "activeSubscriptions=$active; date=$today; stories=${coverage.storyCount}; categories=${coverage.categoryCount}; reasons=${coverage.reasons.joinToString()}"))
        }
        if (!deliverable) logger.error("Delivery blocked at 07:20 KST: today's briefing is missing or held with no verified cards")
        else if (!coverage.targetMet) logger.warn("Delivery will continue below the soft coverage target: {}", coverage.reasons.joinToString())
    }
}
