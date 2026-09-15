package kr.briefly.service

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import nl.martijndwars.webpush.Encoding
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.LocalTime
import java.time.LocalDate
import java.time.ZoneId
import kr.briefly.domain.DeliveryState

class WebPushServiceTest {
    @Test
    fun `web push always uses modern AES128GCM content encoding`() {
        assertThat(WEB_PUSH_CONTENT_ENCODING).isEqualTo(Encoding.AES128GCM)
    }

    @Test
    fun `provider diagnostics redact endpoints and collapse whitespace`() {
        val diagnostic = providerResponseDiagnostic(
            403,
            "denied\nendpoint=https://fcm.googleapis.com/fcm/send/secret\tbad token",
        )

        assertThat(diagnostic).isEqualTo("HTTP 403: denied endpoint=<redacted-url> bad token")
        assertThat(diagnostic).doesNotContain("secret")
    }

    @Test
    fun `regular delivery covers Monday through Friday only`() {
        assertThat(allDeliveryWeekdays).containsExactly(1, 2, 3, 4, 5)
        assertThat(allDeliveryWeekdaysValue).isEqualTo("1,2,3,4,5")
        assertThat(isBriefingWeekday(LocalDate.of(2026, 9, 18))).isTrue()
        assertThat(isBriefingWeekday(LocalDate.of(2026, 9, 19))).isFalse()
        assertThat(isBriefingWeekday(LocalDate.of(2026, 9, 20))).isFalse()
        assertThat(isBriefingWeekday(LocalDate.of(2026, 9, 21))).isTrue()
    }

    @Test
    fun `a briefing is due only during the protected morning delivery window`() {
        val scheduled = LocalTime.of(7, 30)

        assertThat(deliveryIsDue(LocalTime.of(7, 29), scheduled)).isFalse()
        assertThat(deliveryIsDue(LocalTime.of(7, 30), scheduled)).isTrue()
        assertThat(deliveryIsDue(LocalTime.of(7, 48), scheduled)).isTrue()
        assertThat(deliveryIsDue(LocalTime.of(8, 0), scheduled)).isTrue()
        assertThat(deliveryIsDue(LocalTime.of(8, 1), scheduled)).isFalse()
    }

    @Test
    fun `오늘자 브리핑이 없어도 정시 발송 구간에는 안내판을 만든다`() {
        val today = java.time.LocalDate.of(2026, 8, 31)

        assertThat(deliveryFallbackIsRequired(null, today, LocalTime.of(7, 30))).isTrue()
        assertThat(deliveryFallbackIsRequired(today.minusDays(1), today, LocalTime.of(7, 45))).isTrue()
        assertThat(deliveryFallbackIsRequired(today, today, LocalTime.of(7, 30))).isFalse()
        assertThat(deliveryFallbackIsRequired(null, today, LocalTime.of(7, 29))).isFalse()
        assertThat(deliveryFallbackIsRequired(null, today.minusDays(1), LocalTime.of(7, 30))).isFalse()
    }

    @Test
    fun `regular delivery waits for the final morning pass`() {
        val zone = java.time.ZoneId.of("Asia/Seoul")
        val beforeFinalization = OffsetDateTime.of(2026, 8, 22, 5, 59, 59, 0, ZoneOffset.ofHours(9))
        val afterFinalization = OffsetDateTime.of(2026, 8, 22, 6, 0, 1, 0, ZoneOffset.ofHours(9))
        val now = OffsetDateTime.of(2026, 8, 22, 7, 30, 0, 0, ZoneOffset.ofHours(9))

        assertThat(finalizationIsComplete(beforeFinalization, now, fixedFinalizationTime, zone)).isFalse()
        assertThat(finalizationIsComplete(afterFinalization, now, fixedFinalizationTime, zone)).isTrue()
        assertThat(finalizationIsComplete(null, now, fixedFinalizationTime, zone)).isFalse()
    }

    @Test
    fun `invalid finalization time falls back to the safe six o'clock cutoff`() {
        assertThat(parseFinalizationTime("not-a-time")).isEqualTo(fixedFinalizationTime)
        assertThat(parseFinalizationTime("07:15")).isEqualTo(LocalTime.of(7, 15))
    }

    @Test
    fun `only transient push provider statuses are retried`() {
        assertThat(pushStatusIsRetryable(408)).isTrue()
        assertThat(pushStatusIsRetryable(429)).isTrue()
        assertThat(pushStatusIsRetryable(503)).isTrue()
        assertThat(pushStatusIsRetryable(400)).isFalse()
        assertThat(pushStatusIsRetryable(404)).isFalse()
        assertThat(pushStatusIsRetryable(410)).isFalse()
    }

    @Test
    fun `invalid or expired subscriptions are deactivated for clean re-registration`() {
        assertThat(pushEndpointIsInvalid(400)).isTrue()
        assertThat(pushEndpointIsInvalid(401)).isTrue()
        assertThat(pushEndpointIsInvalid(403)).isTrue()
        assertThat(pushEndpointIsInvalid(404)).isTrue()
        assertThat(pushEndpointIsInvalid(410)).isTrue()
        assertThat(pushEndpointIsInvalid(429)).isFalse()
        assertThat(pushEndpointIsInvalid(503)).isFalse()
    }

    @Test
    fun `forced delivery tolerates a subscription disappearing before dispatch`() {
        assertThat(forcedDispatchCountIsSafe(expected = 15, current = 14)).isTrue()
        assertThat(forcedDispatchCountIsSafe(expected = 14, current = 15)).isFalse()
        assertThat(forcedDispatchCountIsSafe(expected = 0, current = 0)).isTrue()
    }

    @Test
    fun `recovery skips devices already delivered by attempt or successful send date`() {
        val zone = ZoneId.of("Asia/Seoul")
        val date = LocalDate.of(2026, 9, 1)
        val sentToday = OffsetDateTime.of(2026, 9, 1, 7, 30, 0, 0, ZoneOffset.ofHours(9))
        val sentYesterday = sentToday.minusDays(1)

        assertThat(deliveryAlreadyCompleted(DeliveryState.DELIVERED, null, date, zone)).isTrue()
        assertThat(deliveryAlreadyCompleted(DeliveryState.FAILED, sentToday, date, zone)).isTrue()
        assertThat(deliveryAlreadyCompleted(DeliveryState.FAILED, sentYesterday, date, zone)).isFalse()
        assertThat(deliveryAlreadyCompleted(null, null, date, zone)).isFalse()
    }

    @Test
    fun `VAPID public key is derived from the configured private key`() {
        // P-256 scalar 1 maps to the standard curve generator point.
        val privateKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE"
        val expectedPublicKey = "BGsX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKWT-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU"

        val resolution = resolveVapidKey("mismatched-public-key", privateKey)

        assertThat(resolution.publicKey).isEqualTo(expectedPublicKey)
        assertThat(resolution.configuredPublicKeyMatchesPrivateKey).isFalse()
    }

    @Test
    fun `matching VAPID pair is recognized without padding`() {
        val privateKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE"
        val publicKey = "BGsX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKWT-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU"

        assertThat(resolveVapidKey("$publicKey=", privateKey).configuredPublicKeyMatchesPrivateKey).isTrue()
    }
}
