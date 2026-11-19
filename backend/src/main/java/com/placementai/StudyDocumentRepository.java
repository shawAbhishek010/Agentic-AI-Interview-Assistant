package com.placementai;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
interface StudyDocumentRepository extends JpaRepository<StudyDocument,String> {
    List<StudyDocument> findByOwnerIdOrderByCreatedAtDesc(String ownerId);
    long countByOwnerId(String ownerId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<StudyDocument> findByIdAndOwnerId(String id,String ownerId);
}
