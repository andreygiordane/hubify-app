package com.hubify.application.service;

import com.hubify.application.dto.UserDTO;
import com.hubify.domain.model.User;
import com.hubify.infrastructure.persistence.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class AuthService {

    private static final int MIN_PASSWORD_LENGTH = 8;

    @Autowired
    private UserRepository userRepository;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public UserDTO register(User user) {
        validatePassword(user.getPassword());

        if (userRepository.findByEmail(user.getEmail()).isPresent()) {
            throw new RuntimeException("Email já cadastrado.");
        }
        if (userRepository.findByUsername(user.getUsername()).isPresent()) {
            throw new RuntimeException("Nome de usuário já cadastrado.");
        }
        user.setRole("Membro da Equipe");
        user.setOnline(true);
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        if (user.getAvatarUrl() == null || user.getAvatarUrl().isEmpty()) {
            user.setAvatarUrl("/image/sem_foto.avif");
        }
        User savedUser = userRepository.save(user);
        return convertToDTO(savedUser);
    }

    public Optional<UserDTO> login(String identifier, String password) {
        if (identifier == null || password == null) {
            return Optional.empty();
        }

        String trimmedIdentifier = identifier.trim();
        Optional<User> optUser = trimmedIdentifier.contains("@")
                ? userRepository.findByEmail(trimmedIdentifier)
                : userRepository.findByUsername(trimmedIdentifier);

        if (optUser.isEmpty()) {
            optUser = userRepository.findByUsername(trimmedIdentifier);
            if (optUser.isEmpty()) {
                optUser = userRepository.findByEmail(trimmedIdentifier);
            }
        }

        if (optUser.isEmpty()) {
            return Optional.empty();
        }

        User user = optUser.get();
        if (!matchesPassword(password, user.getPassword())) {
            return Optional.empty();
        }

        UserDTO dto = convertToDTO(user);
        
        // Verifica se a senha atual (raw) atende aos NOVOS requisitos
        if (!isValidPattern(password)) {
            dto.setMustChangePassword(true);
        }

        // Se for senha antiga (não hashada), hashear agora, mas manter a flag se for fraca
        if (!isHashedPassword(user.getPassword())) {
            user.setPassword(passwordEncoder.encode(password));
        }

        user.setOnline(true);
        userRepository.save(user);
        return Optional.of(dto);
    }

    private boolean isValidPattern(String password) {
        return password != null && password.length() >= MIN_PASSWORD_LENGTH
                && password.matches(".*[0-9].*")
                && password.matches(".*[!@#$%^&*].*")
                && password.matches(".*[A-Z].*");
    }

    public List<UserDTO> getAllUsers() {
        return userRepository.findAll().stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
    }

    public Optional<User> findById(String id) {
        return userRepository.findById(id);
    }

    public User save(User user) {
        if (user.getPassword() != null && !user.getPassword().isBlank() && !isHashedPassword(user.getPassword())) {
            validatePassword(user.getPassword());
            user.setPassword(passwordEncoder.encode(user.getPassword()));
        }
        return userRepository.save(user);
    }

    public boolean matchesPassword(String rawPassword, String storedPassword) {
        if (rawPassword == null || storedPassword == null) {
            return false;
        }

        if (isHashedPassword(storedPassword)) {
            return passwordEncoder.matches(rawPassword, storedPassword);
        }

        return storedPassword.equals(rawPassword);
    }

    private void validatePassword(String password) {
        if (password == null || password.length() < MIN_PASSWORD_LENGTH
                || !password.matches(".*[0-9].*")
                || !password.matches(".*[!@#$%^&*].*")
                || !password.matches(".*[A-Z].*")) {
            throw new RuntimeException("A senha precisa ter no mínimo 8 caracteres, um número, uma letra maiúscula e um caractere especial.");
        }
    }

    private boolean isHashedPassword(String password) {
        return password != null && password.startsWith("$2");
    }

    public UserDTO convertToDTO(User user) {
        UserDTO dto = new UserDTO();
        dto.setId(user.getId());
        dto.setUsername(user.getUsername());
        dto.setEmail(user.getEmail());
        dto.setDisplayName(user.getDisplayName());
        String av = user.getAvatarUrl();
        if (av == null || av.isEmpty() || av.equals("/images/default-avatar.png") || av.contains("api.dicebear.com/7.x/avataaars")) {
            av = "/image/sem_foto.avif";
        }
        dto.setAvatarUrl(av);
        dto.setRole(user.getRole());
        dto.setOnline(user.isOnline());
        dto.setStatus(user.getStatus());
        dto.setStatusMessage(user.getStatusMessage());
        dto.setBio(user.getBio());
        dto.setActiveDMs(user.getActiveDMs());
        dto.setReadTimestamps(user.getReadTimestamps());
        // mustChangePassword não é persistido no User, é calculado no login ou setado manualmente
        return dto;
    }
}
