package com.placementai;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface ResumeMockRepository extends JpaRepository<ResumeMock, String> {
    long countByOwnerId(String ownerId);
    List<ResumeMock> findByOwnerIdOrderByCreatedAtDesc(String ownerId);
    Optional<ResumeMock> findByIdAndOwnerId(String id, String ownerId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from ResumeMock r where r.id = :id and r.ownerId = :ownerId")
    Optional<ResumeMock> lockOwned(@Param("id") String id, @Param("ownerId") String ownerId);
}
