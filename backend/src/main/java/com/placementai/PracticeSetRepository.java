package com.placementai;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
interface PracticeSetRepository extends JpaRepository<PracticeSet,String> {
    List<PracticeSet> findByOwnerIdOrderByCreatedAtDesc(String ownerId);
    Optional<PracticeSet> findByIdAndOwnerId(String id,String ownerId);
}
