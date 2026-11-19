package com.placementai;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@RestController @RequestMapping("/api")
class AuthController {
    private final UserRepository users; private final PasswordEncoder passwords; private final JwtEncoder encoder; private final boolean demoEnabled;
    AuthController(UserRepository users,PasswordEncoder passwords,JwtEncoder encoder,@Value("${app.demo-enabled}") boolean demoEnabled) {this.users=users;this.passwords=passwords;this.encoder=encoder;this.demoEnabled=demoEnabled;}
    record Register(@NotBlank @Size(max=80) String name,@NotBlank @Email @Size(max=254) String email,@NotBlank @Size(min=10,max=72) String password) {
        @Override public String toString() {return "Register[credentials redacted]";}
    }
    record Login(@NotBlank @Email @Size(max=254) String email,@NotBlank @Size(max=72) String password) {
        @Override public String toString() {return "Login[credentials redacted]";}
    }
    @PostMapping("/auth/register") @ResponseStatus(HttpStatus.CREATED)
    Map<String,Object> register(@Valid @RequestBody Register body) {
        if(body.password().getBytes(java.nio.charset.StandardCharsets.UTF_8).length>72) throw new ApiException(400,"Password must fit within BCrypt's 72-byte limit");
        String email=body.email().trim().toLowerCase(Locale.ROOT);
        if(users.existsByEmail(email)) throw new ApiException(409,"An account with this email already exists");
        var user=users.save(new AppUser(body.name().trim(),email,passwords.encode(body.password())));return auth(user);
    }
    @PostMapping("/auth/login")
    Map<String,Object> login(@Valid @RequestBody Login body) {
        if(body.password().getBytes(java.nio.charset.StandardCharsets.UTF_8).length>72) throw new ApiException(401,"Email or password is incorrect");
        var user=users.findByEmail(body.email().trim().toLowerCase(Locale.ROOT)).orElse(null);
        if(user==null || !passwords.matches(body.password(),user.passwordHash)) throw new ApiException(401,"Email or password is incorrect");
        return auth(user);
    }
    @PostMapping("/auth/demo")
    Map<String,Object> demo() {
        if(!demoEnabled) throw new ApiException(403,"Guest demo is disabled");
        var user=users.save(new AppUser("Student","demo-"+UUID.randomUUID()+"@example.invalid",passwords.encode(UUID.randomUUID().toString())));return auth(user);
    }
    @GetMapping("/me") Map<String,Object> me(@AuthenticationPrincipal Jwt jwt) {
        return userView(users.findById(jwt.getSubject()).orElseThrow(()->new ApiException(401,"Account not found")));
    }
    private Map<String,Object> auth(AppUser user) {
        var now=Instant.now();
        var claims=JwtClaimsSet.builder().issuer("placement-ai").subject(user.id).issuedAt(now).expiresAt(now.plus(12,ChronoUnit.HOURS)).claim("role",user.role).build();
        String token=encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),claims)).getTokenValue();
        return Map.of("token",token,"user",userView(user));
    }
    static Map<String,Object> userView(AppUser u) {return Map.of("id",u.id,"name",u.name,"email",u.email,"role",u.role);}
    @Bean ApplicationRunner bootstrapAdmin(@Value("${app.admin-email}") String email,@Value("${app.admin-password}") String password) {
        return args->{
            if(email.isBlank() && password.isBlank()) return;
            if(email.isBlank() || password.length()<12 || password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>72) throw new IllegalStateException("Admin bootstrap requires email and a password with at least 12 characters and at most 72 UTF-8 bytes");
            String normalized=email.trim().toLowerCase(Locale.ROOT);
            if(!users.existsByEmail(normalized)) {var admin=new AppUser("Administrator",normalized,passwords.encode(password));admin.role="ADMIN";users.save(admin);}
        };
    }
}
