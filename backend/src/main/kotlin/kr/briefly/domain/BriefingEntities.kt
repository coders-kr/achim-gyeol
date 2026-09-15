package kr.briefly.domain

import jakarta.persistence.*
import java.time.LocalDate
import java.time.OffsetDateTime

enum class Category { POLICY, ECONOMY, FINANCE, SOCIETY, INTERNATIONAL, TECH, LIFE, CULTURE, SPORTS, ESPORTS }
enum class VerificationStatus { VERIFIED, DEVELOPING, CONFLICTING, SINGLE_SOURCE }
enum class FeedbackType { INCORRECT, BIASED, UNCLEAR, HELPFUL, INTERESTED, NOT_INTERESTED }
enum class StoryInterest { INTERESTED, NOT_INTERESTED }
enum class EditorialState { AUTO_APPROVED, REVIEW, APPROVED, HELD, PUBLISHED }
enum class DeliveryState { PENDING, DELIVERED, FAILED, EXPIRED }
enum class ReaderEventType {
    BRIEFING_OPEN,
    CARD_VIEW,
    STORY_DETAIL,
    SOURCE_OPEN,
    SHARE,
    COMPLETE,
    PREMIUM_INTENT,
    PREMIUM_FEATURE_VOTE,
}

@Entity
@Table(name = "briefing_editions")
class BriefingEdition(
    @Column(nullable = false, unique = true) var briefingDate: LocalDate,
    @Column(nullable = false, length = 600) var lead: String,
    @Column(nullable = false) var readMinutes: Int = 5,
    @Column(nullable = false) var publishedAt: OffsetDateTime = OffsetDateTime.now(),
    @Column(nullable = false) var lastVerifiedAt: OffsetDateTime = OffsetDateTime.now(),
    @Column var pipelineGenerated: Boolean? = false,
    @Enumerated(EnumType.STRING) @Column var editorialState: EditorialState? = EditorialState.AUTO_APPROVED,
    @Column var approvedAt: OffsetDateTime? = null,
    @Column(length = 80) var approvedBy: String? = null,
    @Column var editorialPassApplied: Boolean? = false,
    @Column(length = 80) var editorialModel: String? = null,
    @Column var editorialDurationMillis: Long? = null,
    @Column(length = 600) var editorialFallbackReason: String? = null,
    @OneToMany(mappedBy = "edition", cascade = [CascadeType.ALL], orphanRemoval = true)
    @OrderBy("displayOrder ASC")
    var stories: MutableList<NewsStory> = mutableListOf(),
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) var id: Long? = null,
) {
    fun addStory(story: NewsStory) { stories += story; story.edition = this }
}

@Entity
@Table(name = "news_stories")
class NewsStory(
    @Enumerated(EnumType.STRING) @Column(nullable = false) var category: Category,
    @Column(nullable = false, length = 300) var title: String,
    @Column(nullable = false, length = 1200) var summary: String,
    @Column(length = 400) var oneLineSummary: String? = null,
    @Column(nullable = false, length = 700) var whyItMatters: String,
    @Column(length = 500) var whatToWatch: String? = null,
    @Enumerated(EnumType.STRING) @Column(nullable = false) var verificationStatus: VerificationStatus,
    @Column(nullable = false) var qualityScore: Int,
    @Column(nullable = false) var displayOrder: Int,
    @Column(length = 600) var uncertainty: String? = null,
    @Enumerated(EnumType.STRING) @Column var editorialState: EditorialState? = EditorialState.AUTO_APPROVED,
    @Column(length = 600) var backgroundContext: String? = null,
    @Column(length = 800) var plainExplanation: String? = null,
    @Column(length = 1200) var imageUrl: String? = null,
    @Column(length = 255) var imagePublisher: String? = null,
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) var id: Long? = null,
) {
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "edition_id", nullable = false)
    lateinit var edition: BriefingEdition
    @OneToMany(mappedBy = "story", cascade = [CascadeType.ALL], orphanRemoval = true)
    var sources: MutableList<NewsSource> = mutableListOf()
    @OneToMany(mappedBy = "story", cascade = [CascadeType.ALL], orphanRemoval = true)
    @OrderBy("displayOrder ASC")
    var claims: MutableList<NewsClaim> = mutableListOf()
    fun addSource(source: NewsSource) { sources += source; source.story = this }
    fun addClaim(claim: NewsClaim) { claims += claim; claim.story = this }
}

@Entity
@Table(name = "news_claims")
class NewsClaim(
    @Column(nullable = false, length = 700) var statement: String,
    @Column(nullable = false, length = 120) var sourceIndexes: String,
    @Column(nullable = false) var displayOrder: Int,
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) var id: Long? = null,
) {
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "story_id", nullable = false)
    lateinit var story: NewsStory
}

@Entity
@Table(name = "news_sources")
class NewsSource(
    @Column(nullable = false) var publisher: String,
    @Column(nullable = false, length = 1000) var url: String,
    @Column(nullable = false) var publishedAt: OffsetDateTime,
    @Column(nullable = false) var primarySource: Boolean = false,
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) var id: Long? = null,
) {
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "story_id", nullable = false)
    lateinit var story: NewsStory
}

@Entity
@Table(name = "story_feedback", indexes = [Index(name = "idx_story_feedback_user_created", columnList = "userId,createdAt"), Index(name = "idx_story_feedback_story_user", columnList = "storyId,userId")])
class StoryFeedback(
    @Column(nullable = false) var storyId: Long,
    @Column(nullable = false) var userId: String,
    @Enumerated(EnumType.STRING) @Column(nullable = false) var type: FeedbackType,
    @Column(length = 600) var detail: String? = null,
    @Column(nullable = false) var createdAt: OffsetDateTime = OffsetDateTime.now(),
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) var id: Long? = null,
)

@Entity
@Table(name = "push_subscriptions", indexes = [Index(name = "idx_push_endpoint_hash", columnList = "endpointHash", unique = true)])
class PushSubscription(
    @Column(nullable = false, length = 80) var ownerId: String,
    @Column(nullable = false, length = 64) var endpointHash: String,
    @Column(nullable = false, length = 3000) var endpoint: String,
    @Column(nullable = false, length = 255) var p256dh: String,
    @Column(nullable = false, length = 255) var auth: String,
    @Column(nullable = false, length = 64) var timezone: String = "Asia/Seoul",
    @Column(nullable = false) var deliveryHour: Int = 7,
    @Column(nullable = false) var deliveryMinute: Int = 30,
    @Column(nullable = false, length = 32) var weekdays: String = "1,2,3,4,5",
    @Column(length = 500) var userAgent: String? = null,
    @Column(nullable = false) var active: Boolean = true,
    @Column(nullable = false) var createdAt: OffsetDateTime = OffsetDateTime.now(),
    @Column(nullable = false) var updatedAt: OffsetDateTime = OffsetDateTime.now(),
    var lastSentAt: OffsetDateTime? = null,
    var onboardingPreviewSentAt: OffsetDateTime? = null,
    @Column(length = 600) var lastError: String? = null,
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) var id: Long? = null,
)

@Entity
@Table(name = "subscription_metric_snapshots")
class SubscriptionMetricSnapshot(
    @Column(nullable = false) var activeSubscriptions: Int,
    @Column(nullable = false, length = 64) var reason: String,
    @Column(nullable = false) var capturedAt: OffsetDateTime = OffsetDateTime.now(),
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) var id: Long? = null,
)

@Entity
@Table(name = "editorial_audit_logs", indexes = [Index(name = "idx_audit_created_at", columnList = "createdAt")])
class EditorialAuditLog(
    @Column(nullable = false, length = 64) var action: String,
    @Column(length = 64) var targetType: String? = null,
    @Column var targetId: Long? = null,
    @Column(nullable = false, length = 80) var actor: String,
    @Column(length = 1000) var detail: String? = null,
    @Column(nullable = false) var createdAt: OffsetDateTime = OffsetDateTime.now(),
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) var id: Long? = null,
)

@Entity
@Table(name = "story_corrections", indexes = [Index(name = "idx_correction_story", columnList = "storyId")])
class StoryCorrection(
    @Column(nullable = false) var storyId: Long,
    @Column(nullable = false, length = 800) var beforeText: String,
    @Column(nullable = false, length = 800) var afterText: String,
    @Column(nullable = false, length = 500) var reason: String,
    @Column(nullable = false, length = 80) var correctedBy: String,
    @Column(nullable = false) var createdAt: OffsetDateTime = OffsetDateTime.now(),
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) var id: Long? = null,
)

@Entity
@Table(
    name = "push_delivery_attempts",
    uniqueConstraints = [UniqueConstraint(name = "uq_delivery_edition_subscription", columnNames = ["edition_id", "subscription_id"])],
    indexes = [Index(name = "idx_delivery_created_at", columnList = "createdAt")],
)
class PushDeliveryAttempt(
    @Column(name = "edition_id", nullable = false) var editionId: Long,
    @Column(name = "subscription_id", nullable = false) var subscriptionId: Long,
    @Enumerated(EnumType.STRING) @Column(nullable = false) var state: DeliveryState = DeliveryState.PENDING,
    @Column(nullable = false) var attempts: Int = 0,
    @Column var lastAttemptAt: OffsetDateTime? = null,
    @Column var deliveredAt: OffsetDateTime? = null,
    @Column(length = 600) var error: String? = null,
    @Column(nullable = false) var createdAt: OffsetDateTime = OffsetDateTime.now(),
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) var id: Long? = null,
)

@Entity
@Table(name = "reader_preferences", indexes = [Index(name = "idx_reader_owner", columnList = "ownerId", unique = true)])
class ReaderPreference(
    @Column(nullable = false, length = 80) var ownerId: String,
    @Column(nullable = false, length = 300) var categories: String = "정책,경제,금융,사회,국제,테크,생활,문화,스포츠,e스포츠",
    @Column(nullable = false, length = 16) var digestSize: String = "standard",
    @Column(nullable = false, length = 32) var weekdays: String = "1,2,3,4,5",
    @Column(nullable = false) var consent: Boolean = true,
    @Column(nullable = false) var updatedAt: OffsetDateTime = OffsetDateTime.now(),
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) var id: Long? = null,
)

@Entity
@Table(name = "reader_events", indexes = [Index(name = "idx_reader_event_created", columnList = "createdAt"), Index(name = "idx_reader_event_edition", columnList = "editionId")])
class ReaderEvent(
    @Enumerated(EnumType.STRING) @Column(nullable = false) var type: ReaderEventType,
    @Column(nullable = false) var editionId: Long,
    @Column var storyId: Long? = null,
    @Column(nullable = false, length = 64) var actorHash: String,
    @Column(nullable = false) var createdAt: OffsetDateTime = OffsetDateTime.now(),
    @Column(name = "event_key", length = 80) var eventKey: String? = null,
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) var id: Long? = null,
)
