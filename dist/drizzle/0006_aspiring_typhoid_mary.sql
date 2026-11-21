ALTER TABLE `items` ADD `kept` integer DEFAULT false NOT NULL;
--> statement-breakpoint
DROP TRIGGER IF EXISTS items_fts_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS items_fts_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS items_fts_delete;
--> statement-breakpoint
DROP TRIGGER IF EXISTS content_fts_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS content_fts_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS content_fts_delete;
--> statement-breakpoint
DROP TABLE article_fts;
--> statement-breakpoint
CREATE VIRTUAL TABLE article_fts USING fts5(title,body,fullText,offlineText,notes, tokenize='trigram');
--> statement-breakpoint
INSERT INTO article_fts(rowid,title,body,fullText,offlineText,notes) SELECT i._id,i.title,html_text(i.content),coalesce(c.fullText,''),coalesce(c.offlineText,''),coalesce(n.text,'') FROM items i LEFT JOIN article_content c ON c.itemId=i._id LEFT JOIN article_notes n ON n.itemId=i._id;
--> statement-breakpoint
CREATE TRIGGER items_fts_insert AFTER INSERT ON items BEGIN DELETE FROM article_fts WHERE rowid=new._id; INSERT INTO article_fts(rowid,title,body,fullText,offlineText,notes) SELECT i._id,i.title,html_text(i.content),coalesce(c.fullText,''),coalesce(c.offlineText,''),coalesce(n.text,'') FROM items i LEFT JOIN article_content c ON c.itemId=i._id LEFT JOIN article_notes n ON n.itemId=i._id WHERE i._id=new._id; END;
--> statement-breakpoint
CREATE TRIGGER items_fts_update AFTER UPDATE OF title,content ON items BEGIN DELETE FROM article_fts WHERE rowid=new._id; INSERT INTO article_fts(rowid,title,body,fullText,offlineText,notes) SELECT i._id,i.title,html_text(i.content),coalesce(c.fullText,''),coalesce(c.offlineText,''),coalesce(n.text,'') FROM items i LEFT JOIN article_content c ON c.itemId=i._id LEFT JOIN article_notes n ON n.itemId=i._id WHERE i._id=new._id; END;
--> statement-breakpoint
CREATE TRIGGER items_fts_delete AFTER DELETE ON items BEGIN DELETE FROM article_fts WHERE rowid=old._id; INSERT INTO article_fts(rowid,title,body,fullText,offlineText,notes) SELECT i._id,i.title,html_text(i.content),coalesce(c.fullText,''),coalesce(c.offlineText,''),coalesce(n.text,'') FROM items i LEFT JOIN article_content c ON c.itemId=i._id LEFT JOIN article_notes n ON n.itemId=i._id WHERE i._id=old._id; END;
--> statement-breakpoint
CREATE TRIGGER content_fts_insert AFTER INSERT ON article_content BEGIN DELETE FROM article_fts WHERE rowid=new.itemId; INSERT INTO article_fts(rowid,title,body,fullText,offlineText,notes) SELECT i._id,i.title,html_text(i.content),coalesce(c.fullText,''),coalesce(c.offlineText,''),coalesce(n.text,'') FROM items i LEFT JOIN article_content c ON c.itemId=i._id LEFT JOIN article_notes n ON n.itemId=i._id WHERE i._id=new.itemId; END;
--> statement-breakpoint
CREATE TRIGGER content_fts_update AFTER UPDATE OF fullText,offlineText ON article_content BEGIN DELETE FROM article_fts WHERE rowid=new.itemId; INSERT INTO article_fts(rowid,title,body,fullText,offlineText,notes) SELECT i._id,i.title,html_text(i.content),coalesce(c.fullText,''),coalesce(c.offlineText,''),coalesce(n.text,'') FROM items i LEFT JOIN article_content c ON c.itemId=i._id LEFT JOIN article_notes n ON n.itemId=i._id WHERE i._id=new.itemId; END;
--> statement-breakpoint
CREATE TRIGGER content_fts_delete AFTER DELETE ON article_content BEGIN DELETE FROM article_fts WHERE rowid=old.itemId; INSERT INTO article_fts(rowid,title,body,fullText,offlineText,notes) SELECT i._id,i.title,html_text(i.content),coalesce(c.fullText,''),coalesce(c.offlineText,''),coalesce(n.text,'') FROM items i LEFT JOIN article_content c ON c.itemId=i._id LEFT JOIN article_notes n ON n.itemId=i._id WHERE i._id=old.itemId; END;
--> statement-breakpoint
CREATE TRIGGER notes_fts_insert AFTER INSERT ON article_notes BEGIN DELETE FROM article_fts WHERE rowid=new.itemId; INSERT INTO article_fts(rowid,title,body,fullText,offlineText,notes) SELECT i._id,i.title,html_text(i.content),coalesce(c.fullText,''),coalesce(c.offlineText,''),coalesce(n.text,'') FROM items i LEFT JOIN article_content c ON c.itemId=i._id LEFT JOIN article_notes n ON n.itemId=i._id WHERE i._id=new.itemId; END;
--> statement-breakpoint
CREATE TRIGGER notes_fts_update AFTER UPDATE OF text ON article_notes BEGIN DELETE FROM article_fts WHERE rowid=new.itemId; INSERT INTO article_fts(rowid,title,body,fullText,offlineText,notes) SELECT i._id,i.title,html_text(i.content),coalesce(c.fullText,''),coalesce(c.offlineText,''),coalesce(n.text,'') FROM items i LEFT JOIN article_content c ON c.itemId=i._id LEFT JOIN article_notes n ON n.itemId=i._id WHERE i._id=new.itemId; END;
--> statement-breakpoint
CREATE TRIGGER notes_fts_delete AFTER DELETE ON article_notes BEGIN DELETE FROM article_fts WHERE rowid=old.itemId; INSERT INTO article_fts(rowid,title,body,fullText,offlineText,notes) SELECT i._id,i.title,html_text(i.content),coalesce(c.fullText,''),coalesce(c.offlineText,''),coalesce(n.text,'') FROM items i LEFT JOIN article_content c ON c.itemId=i._id LEFT JOIN article_notes n ON n.itemId=i._id WHERE i._id=old.itemId; END;
