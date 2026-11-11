package com.hubify.domain.model;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Table(name = "users")
@Data
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;
    
    private String displayName;
    
    @Column(unique = true, nullable = false)
    private String username;
    
    @Column(unique = true, nullable = false)
    private String email;
    
    @Column(nullable = false, length = 255)
    private String password;
    
    @Column(columnDefinition = "TEXT")
    private String avatarUrl;
    private String role;
    @Column(name = "is_online")
    private boolean online;
    private String status;
    // Frase curta escolhida pela pessoa (ex.: "Em home office", "Volto às 14h")
    @Column(name = "status_message", length = 120)
    private String statusMessage;
    @Column(columnDefinition = "TEXT")
    private String bio;
    @Column(columnDefinition = "TEXT")
    private String activeDMs; // JSON array como string: ["user1", "user2"]
    
    @Column(columnDefinition = "TEXT")
    private String readTimestamps; // JSON map como string: {"roomId": 123456789}
}
