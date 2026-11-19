package com.placementai;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
interface InterviewRepository extends JpaRepository<Interview,String> {
    List<Interview> findByOwnerIdOrderByCreatedAtDesc(String ownerId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Interview> findByIdAndOwnerId(String id,String ownerId);
}
