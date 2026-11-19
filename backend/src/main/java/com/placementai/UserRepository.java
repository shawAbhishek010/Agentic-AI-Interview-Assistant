package com.placementai;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
interface UserRepository extends JpaRepository<AppUser,String> {
    Optional<AppUser> findByEmail(String email);
    boolean existsByEmail(String email);
}
