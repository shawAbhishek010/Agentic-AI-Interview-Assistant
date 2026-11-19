package com.placementai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class PlacementApplication {
    public static void main(String[] args) {
        // A host-wide DEBUG environment variable must not enable request/body logging.
        System.setProperty("debug", "false");
        SpringApplication.run(PlacementApplication.class, args);
    }
}
