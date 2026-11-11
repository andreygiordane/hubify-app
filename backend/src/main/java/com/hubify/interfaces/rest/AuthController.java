package com.hubify.interfaces.rest;

import com.hubify.application.dto.UserDTO;
import com.hubify.application.service.AuthService;
import com.hubify.domain.model.User;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    @Autowired
    private AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody User user) {
        try {
            UserDTO savedUser = authService.register(user);
            return ResponseEntity.ok(savedUser);
        } catch (RuntimeException e) {
            String msg = e.getMessage();
            if (msg.contains("cadastrado")) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(msg);
            }
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Erro ao registrar usuário: " + msg);
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Erro ao registrar usuário: " + e.getMessage());
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody User loginRequest) {
        String identifier = loginRequest.getUsername();
        if (identifier == null || identifier.isBlank()) {
            identifier = loginRequest.getEmail();
        }

        Optional<UserDTO> optUser = authService.login(identifier, loginRequest.getPassword());
        if (optUser.isPresent()) {
            return ResponseEntity.ok(optUser.get());
        }
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid credentials");
    }

    @GetMapping("/users")
    public ResponseEntity<List<UserDTO>> getAllUsers() {
        return ResponseEntity.ok(authService.getAllUsers());
    }
    
    @PutMapping("/users/{userId}")
    public ResponseEntity<?> updateUser(@PathVariable String userId, @RequestBody Map<String, Object> updateData) {
        try {
            Optional<User> optUser = authService.findById(userId);
            if (!optUser.isPresent()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Usuário não encontrado");
            }
            
            User user = optUser.get();
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            
            if (updateData.containsKey("displayName") && updateData.get("displayName") != null) {
                user.setDisplayName(updateData.get("displayName").toString());
            }
            if (updateData.containsKey("avatarUrl") && updateData.get("avatarUrl") != null) {
                user.setAvatarUrl(updateData.get("avatarUrl").toString());
            }
            if (updateData.containsKey("role") && updateData.get("role") != null) {
                user.setRole(updateData.get("role").toString());
            }
            if (updateData.containsKey("activeDMs") && updateData.get("activeDMs") != null) {
                Object val = updateData.get("activeDMs");
                user.setActiveDMs(val instanceof String ? (String)val : mapper.writeValueAsString(val));
            }
            if (updateData.containsKey("isOnline")) {
                user.setOnline(Boolean.parseBoolean(updateData.get("isOnline").toString()));
            }
            if (updateData.containsKey("status") && updateData.get("status") != null) {
                user.setStatus(updateData.get("status").toString());
            }
            if (updateData.containsKey("statusMessage") && updateData.get("statusMessage") != null) {
                String msg = updateData.get("statusMessage").toString().trim();
                user.setStatusMessage(msg.length() > 120 ? msg.substring(0, 120) : msg);
            }
            if (updateData.containsKey("bio") && updateData.get("bio") != null) {
                user.setBio(updateData.get("bio").toString());
            }
            if (updateData.containsKey("password") && updateData.get("password") != null) {
                user.setPassword(updateData.get("password").toString());
            }
            if (updateData.containsKey("readTimestamps") && updateData.get("readTimestamps") != null) {
                Object val = updateData.get("readTimestamps");
                user.setReadTimestamps(val instanceof String ? (String)val : mapper.writeValueAsString(val));
            }
            
            User savedUser = authService.save(user);
            return ResponseEntity.ok(authService.convertToDTO(savedUser));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Erro ao atualizar usuário: " + e.getMessage());
        }
    }
}
