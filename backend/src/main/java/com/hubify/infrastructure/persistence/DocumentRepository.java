package com.hubify.infrastructure.persistence;
import com.hubify.domain.model.DocumentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
public interface DocumentRepository extends JpaRepository<DocumentEntity, String> {
    List<DocumentEntity> findByCollectionName(String collectionName);

    List<DocumentEntity> findByCollectionNameAndDocKey(String collectionName, String docKey);

    // Mensagens alteradas desde "since" nas DMs do usuário e nos grupos informados
    @Query("SELECT d FROM DocumentEntity d WHERE d.collectionName = 'messages' AND d.updatedAt > :since " +
           "AND (d.roomId LIKE CONCAT('dm_%', :userId, '%') OR d.roomId IN :groups) " +
           "ORDER BY d.updatedAt ASC")
    List<DocumentEntity> findMessagesChangedSince(@Param("since") long since, @Param("userId") String userId, @Param("groups") List<String> groups);
}
