CREATE TABLE `article_content` (
	`itemId` integer PRIMARY KEY NOT NULL,
	`fullHtml` text DEFAULT '' NOT NULL,
	`fullText` text DEFAULT '' NOT NULL,
	`fullFetchedAt` integer DEFAULT 0 NOT NULL,
	`offlinePath` text DEFAULT '' NOT NULL,
	`offlineText` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`itemId`) REFERENCES `items`(`_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE VIRTUAL TABLE article_fts USING fts5(title,body,fullText,offlineText, tokenize='trigram');
--> statement-breakpoint
CREATE TRIGGER items_fts_insert AFTER INSERT ON items BEGIN
    INSERT INTO article_fts(rowid,title,body,fullText,offlineText) VALUES(new._id,new.title,html_text(new.content),'','');
END;
--> statement-breakpoint
CREATE TRIGGER items_fts_update AFTER UPDATE OF title,content ON items BEGIN
    DELETE FROM article_fts WHERE rowid=old._id;
    INSERT INTO article_fts(rowid,title,body,fullText,offlineText)
    SELECT new._id,new.title,html_text(new.content),coalesce(c.fullText,''),coalesce(c.offlineText,'')
    FROM (SELECT 1) LEFT JOIN article_content c ON c.itemId=new._id;
END;
--> statement-breakpoint
CREATE TRIGGER items_fts_delete AFTER DELETE ON items BEGIN
    DELETE FROM article_fts WHERE rowid=old._id;
END;
--> statement-breakpoint
CREATE TRIGGER content_fts_insert AFTER INSERT ON article_content BEGIN
    DELETE FROM article_fts WHERE rowid=new.itemId;
    INSERT INTO article_fts(rowid,title,body,fullText,offlineText)
    SELECT _id,title,html_text(content),new.fullText,new.offlineText FROM items WHERE _id=new.itemId;
END;
--> statement-breakpoint
CREATE TRIGGER content_fts_update AFTER UPDATE OF fullText,offlineText ON article_content BEGIN
    DELETE FROM article_fts WHERE rowid=new.itemId;
    INSERT INTO article_fts(rowid,title,body,fullText,offlineText)
    SELECT _id,title,html_text(content),new.fullText,new.offlineText FROM items WHERE _id=new.itemId;
END;
--> statement-breakpoint
CREATE TRIGGER content_fts_delete AFTER DELETE ON article_content BEGIN
    DELETE FROM article_fts WHERE rowid=old.itemId;
    INSERT INTO article_fts(rowid,title,body,fullText,offlineText)
    SELECT _id,title,html_text(content),'','' FROM items WHERE _id=old.itemId;
END;
