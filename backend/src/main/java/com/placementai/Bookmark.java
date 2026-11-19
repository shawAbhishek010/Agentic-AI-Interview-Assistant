package com.placementai;
import jakarta.persistence.*;
import java.util.UUID;
@Entity @Table(name="bookmarks",uniqueConstraints=@UniqueConstraint(columnNames={"ownerId","questionId"}))
class Bookmark {
    @Id String id=UUID.randomUUID().toString();
    String ownerId;
    String questionId;
}
