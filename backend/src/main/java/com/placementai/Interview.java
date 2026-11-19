package com.placementai;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="interview_sessions",indexes=@Index(name="interview_owner",columnList="ownerId"))
class Interview {
    @Id String id=UUID.randomUUID().toString();
    @Column(nullable=false) String ownerId;
    String role;
    String topic;
    String difficulty;
    String status="active";
    @Column(columnDefinition="text",nullable=false) String questionsJson="[]";
    @Column(columnDefinition="text",nullable=false) String turnsJson="[]";
    @Column(columnDefinition="text",nullable=false) String traceJson="[]";
    @Column(columnDefinition="text default '[]'",nullable=false) String chatJson="[]";
    Instant createdAt=Instant.now();
    Instant finishedAt;
    @Version Long version;
}
