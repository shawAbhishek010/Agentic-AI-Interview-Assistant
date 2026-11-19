package com.placementai;

import jakarta.persistence.*;
import java.util.UUID;

@Entity @Table(name="app_users")
class AppUser {
    @Id String id = UUID.randomUUID().toString();
    @Column(nullable=false,length=80) String name;
    @Column(nullable=false,unique=true,length=254) String email;
    @Column(nullable=false) String passwordHash;
    @Column(nullable=false) String role = "USER";
    protected AppUser() {}
    AppUser(String name, String email, String hash) { this.name=name; this.email=email; this.passwordHash=hash; }
}
