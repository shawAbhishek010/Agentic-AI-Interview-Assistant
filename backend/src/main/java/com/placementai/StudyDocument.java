package com.placementai;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="study_documents",indexes=@Index(name="study_document_owner",columnList="ownerId"))
class StudyDocument {
    @Id String id=UUID.randomUUID().toString();
    @Column(nullable=false) String ownerId;
    @Column(nullable=false,length=200) String title;
    @Column(nullable=false) String fileName;
    int characterCount;
    int chunkCount;
    @Column(columnDefinition="text",nullable=false) String chunksJson;
    @Column(columnDefinition="text",nullable=false) String materialsJson="[]";
    Instant createdAt=Instant.now();
    @Version Long version;
}
