/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to You under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */

package org.apache.hugegraph.loader.metrics;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * RangesTimer is a customized timer used to count the total time consumption
 * of multiple time ranges of multiple threads, each TimeRange represents a
 * time section, it means that a thread performs certain tasks during this time
 * section, such as parsing or loading.
 *
 * <pre>
 * TimeLine    1__2__3__4__5__6__7__8
 *
 * Thread-1    1_____3
 * Thread-2       2_____4
 * Thread-3                5_____7
 * Thread-4                5__6
 *
 * occupancy   |========|  |=====|
 *                 3     +    2
 * </pre>
 * <p>
 * It's thread safe
 */
public class RangesTimer {

    private final int capacity;
    private final List<TimeRange> ranges;
    private long lastEnd;
    private long totalTime;

    public RangesTimer(int capacity) {
        this.capacity = capacity;
        this.ranges = new ArrayList<>(capacity);
        this.lastEnd = 0L;
        this.totalTime = 0L;
    }

    public synchronized long totalTime() {
        if (!this.ranges.isEmpty()) {
            long incrTime = this.calculate();
            this.totalTime += incrTime;
            this.ranges.clear();
        }
        return this.totalTime;
    }

    public synchronized void addTimeRange(long start, long end) {
        if (this.ranges.size() >= this.capacity) {
            long incrTime = this.calculate();
            this.totalTime += incrTime;
            this.ranges.clear();
        }
        this.ranges.add(new TimeRange(start, end));
    }

    private long calculate() {
        assert !this.ranges.isEmpty();
        this.ranges.sort(Comparator.comparingLong(TimeRange::start));
        long time = 0L;
        long start = this.lastEnd;
        long end = this.lastEnd;
        for (TimeRange range : this.ranges) {
            if (range.start() <= end) {
                /*
                 * There is overlap, merging range
                 *
                 * Thread-1    1_____3
                 * Thread-2       2_____4
                 * Thread-3          3_____5
                 *
                 * The 'end' is updated to 3->4->5, the range expand to [1, 5]
                 */
                end = Math.max(end, range.end());
            } else {
                /*
                 * There is no overlap, calculate the length of the old range
                 * then open up a new range
                 *
                 * Thread-4                   6_____8
                 */
                time += (end - start);
                start = range.start();
                end = range.end();
            }
            this.lastEnd = Math.max(this.lastEnd, end);
        }
        time += (end - start);
        return time;
    }

    private static class TimeRange {

        private final long start;
        private final long end;

        public TimeRange(long start, long end) {
            this.start = start;
            this.end = end;
        }

        public long start() {
            return this.start;
        }

        public long end() {
            return this.end;
        }
    }
}
