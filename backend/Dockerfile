# Build the bootJar using CI or deploy/scripts/verify.sh first.
FROM eclipse-temurin:26-jre-alpine
RUN apk add --no-cache wget && addgroup -S seax && adduser -S -G seax seax
WORKDIR /app
COPY --chown=seax:seax build/libs/application.jar /app/application.jar
USER seax
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/application.jar"]
