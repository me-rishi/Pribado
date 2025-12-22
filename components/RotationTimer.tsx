'use client';
import { useState, useEffect, useRef } from 'react';

// Helper component for live countdown - Moved outside to prevent re-creation
export const RotationTimer = ({ targetTime, interval, onLoop }: { targetTime: number; interval: number; onLoop?: () => void }) => {
    // Ref to track callback without re-triggering effect
    const onLoopRef = useRef(onLoop);
    useEffect(() => { onLoopRef.current = onLoop; }, [onLoop]);

    // Ref to prevent double-firing for the same cycle
    const lastCycleRef = useRef<number>(-1);
    const lastRenderedSecondRef = useRef<number>(-1);

    // Initialize with correct calculation
    const calculateState = () => {
        const now = Date.now();
        let diff = targetTime - now;

        if (diff < 0 && interval > 0) {
            const elapsedSinceTarget = Math.abs(diff);
            const timeIntoCurrentCycle = elapsedSinceTarget % interval;
            diff = interval - timeIntoCurrentCycle;
        }
        return diff < 0 ? 0 : diff;
    };

    const [remaining, setRemaining] = useState(calculateState());

    useEffect(() => {
        const update = () => {
            const now = Date.now();
            let diff = targetTime - now;

            // If expired, calculate time until next virtual rotation
            if (diff < 0 && interval > 0) {
                const elapsedSinceTarget = Math.abs(diff);
                const currentCycle = Math.floor(elapsedSinceTarget / interval);
                const timeIntoCurrentCycle = elapsedSinceTarget % interval;
                diff = interval - timeIntoCurrentCycle;

                // Trigger loop callback if we are in a NEW cycle
                if (currentCycle > lastCycleRef.current) {
                    lastCycleRef.current = currentCycle;
                    // Run loop callback in next tick to avoid blocking render
                    setTimeout(() => {
                        if (onLoopRef.current) onLoopRef.current();
                    }, 0);
                }
            } else {
                // Reset cycle tracking if we are back in positive time
                lastCycleRef.current = -1;
            }

            // OPTIMIZATION: Only update state if the visible second has changed
            const seconds = Math.floor(diff / 1000);
            if (seconds !== lastRenderedSecondRef.current) {
                lastRenderedSecondRef.current = seconds;
                setRemaining(diff);
            }
        };

        update(); // Immediate update
        const timer = setInterval(update, 200); // Check more often (200ms) but only render on second change
        return () => clearInterval(timer);
    }, [targetTime, interval]);

    if (interval <= 0) return <span className="text-zinc-500">Never</span>;

    // Ensure we don't show negative or weird values
    const safeRemaining = remaining < 0 ? 0 : remaining;

    const hours = Math.floor(safeRemaining / 3600000);
    const minutes = Math.floor((safeRemaining % 3600000) / 60000);
    const seconds = Math.floor((safeRemaining % 60000) / 1000);

    return (
        <span className="font-mono text-emerald-400">
            {hours > 0 ? `${hours}h ` : ''}
            {minutes}m {seconds}s
        </span>
    );
};
