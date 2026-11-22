package com.placementai;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "resume_mocks", indexes = @Index(name = "resume_mock_owner", columnList = "ownerId"))
class ResumeMock {
    @Id String id = UUID.randomUUID().toString();
    @Column(nullable = false) String ownerId;
    @Column(nullable = false, length = 100) String targetRole;
    @Column(nullable = false, length = 250) String fileName;
    @Column(nullable = false, length = 20) String mode;
    @Column(nullable = false, columnDefinition = "text") String questionsJson;
    @Column(nullable = false, columnDefinition = "text") String turnsJson = "[]";
    @Column(nullable = false) Instant createdAt = Instant.now();
    @Version Long version;
}
