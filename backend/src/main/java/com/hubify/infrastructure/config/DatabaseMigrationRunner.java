package com.hubify.infrastructure.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class DatabaseMigrationRunner implements CommandLineRunner {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) throws Exception {
        try {
            System.out.println("Verificando schema do banco de dados...");
            // Força a alteração da coluna avatar_url para TEXT para suportar Base64
            jdbcTemplate.execute("ALTER TABLE users ALTER COLUMN avatar_url TYPE TEXT");
            System.out.println("Coluna avatar_url atualizada para TEXT com sucesso.");
        } catch (Exception e) {
            // Se falhar (ex: coluna já é TEXT ou tabela não existe ainda), apenas ignora ou loga
            System.out.println("Aviso na migração de schema: " + e.getMessage());
        }

        backfillDocumentKeys();
    }

    // Documentos gravados antes das colunas doc_key/room_id/updated_at existirem
    private void backfillDocumentKeys() {
        try {
            jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_documents_key ON documents (collection_name, doc_key)");
            jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_documents_room ON documents (collection_name, room_id, updated_at)");

            ObjectMapper mapper = new ObjectMapper();
            List<Map<String, Object>> rows = jdbcTemplate.queryForList("SELECT id, json_data FROM documents WHERE doc_key IS NULL OR updated_at IS NULL");
            for (Map<String, Object> row : rows) {
                String docKey = null, roomId = null;
                long updatedAt = 0;
                try {
                    JsonNode json = mapper.readTree(String.valueOf(row.get("json_data")));
                    if (json.hasNonNull("id")) docKey = json.get("id").asText();
                    if (json.hasNonNull("roomId")) roomId = json.get("roomId").asText();
                    if (json.hasNonNull("timestamp")) updatedAt = json.get("timestamp").asLong(0);
                } catch (Exception ignored) {
                    // JSON inválido: fica sem chave, mas não trava mais a migração
                }
                jdbcTemplate.update("UPDATE documents SET doc_key = ?, room_id = ?, updated_at = ? WHERE id = ?",
                        docKey, roomId, updatedAt, row.get("id"));
            }
            if (!rows.isEmpty()) System.out.println("Documentos migrados para busca indexada: " + rows.size());
        } catch (Exception e) {
            System.out.println("Aviso na migração de documentos: " + e.getMessage());
        }
    }
}
