package com.placementai;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
interface BookmarkRepository extends JpaRepository<Bookmark,String> {
    List<Bookmark> findByOwnerId(String ownerId);
    Optional<Bookmark> findByOwnerIdAndQuestionId(String ownerId,String questionId);
}
