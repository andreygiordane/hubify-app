package com.hubify.domain.model;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Table(name = "messages")
@Data
public class Message {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;
    
    private String roomId;
    private String text;
    private String senderId;
    private String senderName;
    private String senderAvatar;
    private Long timestamp;
    private String attachmentType;
    private String attachmentName;
    private Long attachmentSize;
}
