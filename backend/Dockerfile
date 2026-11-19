FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /build
COPY backend/pom.xml .
RUN mvn -B -q dependency:go-offline
COPY backend/src ./src
RUN mvn -B -q -DskipTests package
FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S placement && adduser -S placement -G placement
WORKDIR /app
COPY --from=build /build/target/placement-api-1.0.0.jar app.jar
USER placement
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
