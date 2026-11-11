package com.hubify.interfaces.rest;
import com.hubify.domain.model.DocumentEntity;
import com.hubify.infrastructure.persistence.DocumentRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/data")
@CrossOrigin(origins = "*")
public class DocumentController {
    @Autowired private DocumentRepository repo;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @GetMapping("/{collection}")
    public List<DocumentEntity> getAll(@PathVariable String collection) {
        return repo.findByCollectionName(collection);
    }

    /**
     * Sincronização incremental de mensagens: só o que mudou desde "since" (hora do servidor)
     * nas DMs de "user" e nos "groups" informados. Substitui baixar a coleção inteira.
     */
    @GetMapping("/messages/sync")
    public List<DocumentEntity> syncMessages(@RequestParam(defaultValue = "0") long since,
                                             @RequestParam(required = false) String user,
                                             @RequestParam(required = false) String groups) {
        List<String> groupIds = new ArrayList<>();
        if (groups != null) {
            Arrays.stream(groups.split(",")).map(String::trim).filter(s -> !s.isEmpty()).forEach(groupIds::add);
        }
        // IN () vazio é inválido em SQL
        if (groupIds.isEmpty()) groupIds.add("__none__");
        // Sem usuário: valor que nunca casa com uma DM (parâmetro null quebra o LIKE no PostgreSQL)
        String userId = (user == null || user.isBlank()) ? "#nenhum#" : user;
        return repo.findMessagesChangedSince(since, userId, groupIds);
    }

    @PostMapping("/{collection}")
    @Transactional
    public ResponseEntity<DocumentEntity> save(@PathVariable String collection, @RequestBody Object data) {
        try {
            JsonNode json = toJson(data);
            String id = text(json, "id");
            DocumentEntity doc = id != null ? findOne(collection, id).orElse(null) : null;
            if (doc == null) {
                doc = new DocumentEntity();
                doc.setCollectionName(collection);
            }
            return ResponseEntity.ok(repo.save(fill(doc, json)));
        } catch (Exception e) {
            System.err.println("Erro em save: " + e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @PutMapping("/{collection}/{id}")
    @Transactional
    public ResponseEntity<DocumentEntity> update(@PathVariable String collection, @PathVariable String id, @RequestBody Object data) {
        try {
            Optional<DocumentEntity> doc = findOne(collection, id);
            if (doc.isEmpty()) return ResponseEntity.notFound().build();
            return ResponseEntity.ok(repo.save(fill(doc.get(), toJson(data))));
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /** Mescla só os campos enviados (sem o cliente precisar baixar o documento antes). Cria se não existir. */
    @PatchMapping("/{collection}/{id}")
    @Transactional
    public ResponseEntity<DocumentEntity> patch(@PathVariable String collection, @PathVariable String id, @RequestBody Object data) {
        try {
            JsonNode changes = toJson(data);
            if (!changes.isObject()) return ResponseEntity.badRequest().build();
            Optional<DocumentEntity> existing = findOne(collection, id);
            DocumentEntity doc = existing.orElseGet(() -> {
                DocumentEntity d = new DocumentEntity();
                d.setCollectionName(collection);
                return d;
            });
            ObjectNode merged = objectMapper.createObjectNode();
            if (existing.isPresent()) {
                JsonNode current = objectMapper.readTree(doc.getJsonData());
                if (current.isObject()) merged.setAll((ObjectNode) current);
            }
            merged.setAll((ObjectNode) changes);
            merged.put("id", id);
            return ResponseEntity.ok(repo.save(fill(doc, merged)));
        } catch (Exception e) {
            System.err.println("Erro em patch: " + e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    @DeleteMapping("/{collection}/{id}")
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable String collection, @PathVariable String id) {
        try {
            List<DocumentEntity> docs = repo.findByCollectionNameAndDocKey(collection, id);
            if (!docs.isEmpty()) {
                repo.deleteAll(docs);
                return ResponseEntity.ok().build();
            }
            // ID primário do banco (UUID)
            if (repo.existsById(id)) {
                repo.deleteById(id);
                return ResponseEntity.ok().build();
            }
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            System.err.println("Erro em delete: " + e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    private Optional<DocumentEntity> findOne(String collection, String docKey) {
        return repo.findByCollectionNameAndDocKey(collection, docKey).stream().findFirst();
    }

    private JsonNode toJson(Object data) throws Exception {
        return data instanceof String ? objectMapper.readTree((String) data) : objectMapper.valueToTree(data);
    }

    private DocumentEntity fill(DocumentEntity doc, JsonNode json) throws Exception {
        doc.setJsonData(objectMapper.writeValueAsString(json));
        doc.setDocKey(text(json, "id"));
        doc.setRoomId(text(json, "roomId"));
        doc.setUpdatedAt(System.currentTimeMillis());
        return doc;
    }

    private static String text(JsonNode json, String field) {
        JsonNode node = json.get(field);
        return node == null || node.isNull() ? null : node.asText();
    }
}
