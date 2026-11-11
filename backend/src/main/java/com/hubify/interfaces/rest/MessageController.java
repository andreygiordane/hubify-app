package com.hubify.interfaces.rest;

import com.hubify.domain.model.Message;
import com.hubify.infrastructure.persistence.MessageRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/messages")
@CrossOrigin(origins = "*")
public class MessageController {

    @Autowired
    private MessageRepository messageRepository;

    @GetMapping("/{roomId}")
    public ResponseEntity<List<Message>> getMessages(@PathVariable String roomId) {
        return ResponseEntity.ok(messageRepository.findByRoomIdOrderByTimestampAsc(roomId));
    }

    @PostMapping
    public ResponseEntity<Message> sendMessage(@RequestBody Message message) {
        message.setTimestamp(System.currentTimeMillis());
        return ResponseEntity.ok(messageRepository.save(message));
    }
}
