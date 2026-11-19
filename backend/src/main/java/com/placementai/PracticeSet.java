package com.placementai;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
@Entity @Table(name="practice_sets")
class PracticeSet {
    @Id String id=UUID.randomUUID().toString();
    String ownerId;
    String name;
    String role;
    @Column(columnDefinition="text") String questionIdsJson;
    Instant createdAt=Instant.now();
}
