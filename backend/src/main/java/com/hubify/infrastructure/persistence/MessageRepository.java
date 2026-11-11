package com.hubify.infrastructure.persistence;

import com.hubify.domain.model.Message;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MessageRepository extends JpaRepository<Message, String> {
    List<Message> findByRoomIdOrderByTimestampAsc(String roomId);
}
