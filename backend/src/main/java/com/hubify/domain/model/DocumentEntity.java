package com.hubify.domain.model;
import jakarta.persistence.*;
import lombok.Data;
@Entity
@Table(name = "documents") // índices criados em DatabaseMigrationRunner
@Data
public class DocumentEntity {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private String id;
    private String collectionName;
    @Column(columnDefinition = "TEXT") private String jsonData;
    // Copiados do JSON para buscar sem varrer a tabela inteira
    private String docKey;
    private String roomId;
    // Hora do servidor da última gravação (sincronização incremental)
    private Long updatedAt;
}
