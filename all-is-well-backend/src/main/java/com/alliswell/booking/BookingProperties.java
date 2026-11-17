package com.alliswell.booking;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("booking")
public record BookingProperties(
        @DefaultValue("3") int admissionCapacity,
        @DefaultValue("1000") int maxSessions,
        @DefaultValue("2000") int maxReservations,
        @DefaultValue("60") int requestLimit,
        @DefaultValue("PT10M") Duration queueTtl,
        @DefaultValue("PT5M") Duration admissionTtl,
        @DefaultValue("PT2M") Duration holdTtl,
        @DefaultValue("PT10M") Duration receiptTtl) {

    public BookingProperties {
        if (admissionCapacity < 1 || maxSessions < admissionCapacity
                || maxReservations < 1 || requestLimit < 1) {
            throw new IllegalArgumentException("예약 한도 설정을 확인하세요.");
        }
        for (Duration ttl : new Duration[]{queueTtl, admissionTtl, holdTtl, receiptTtl}) {
            if (ttl.toMillis() < 1) {
                throw new IllegalArgumentException("예약 유효기간은 양수여야 합니다.");
            }
        }
    }
}
