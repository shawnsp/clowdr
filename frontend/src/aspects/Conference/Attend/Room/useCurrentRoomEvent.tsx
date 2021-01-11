import * as R from "ramda";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RoomEventsFragment, RoomEventSummaryFragment, RoomMode_Enum } from "../../../../generated/graphql";
import usePolling from "../../../Generic/usePolling";

interface Result {
    currentRoomEvent: RoomEventSummaryFragment | null;
    nextRoomEvent: RoomEventSummaryFragment | null;
    withinThreeMinutesOfBroadcastEvent: boolean;
    secondsUntilBroadcastEvent: number;
}

export function useCurrentRoomEvent(roomEvents: RoomEventsFragment): Result {
    const broadcastEvents = useMemo(
        () =>
            roomEvents.events.filter((event) =>
                [RoomMode_Enum.Prerecorded, RoomMode_Enum.Presentation, RoomMode_Enum.QAndA].includes(
                    event.intendedRoomModeName
                )
            ),
        [roomEvents.events]
    );

    const [currentRoomEvent, setCurrentRoomEvent] = useState<RoomEventSummaryFragment | null>(null);
    const getCurrentEvent = useCallback(() => {
        const now = new Date().getTime();
        const eventsNow = roomEvents.events.filter((event) => {
            const startTime = Date.parse(event.startTime);
            const endTime = Date.parse(event.endTime);
            return startTime < now && now < endTime;
        });
        if (eventsNow.length > 0) {
            setCurrentRoomEvent(eventsNow[0]);
        } else {
            setCurrentRoomEvent(null);
        }
    }, [roomEvents.events]);
    usePolling(getCurrentEvent, 10000, true);

    const [withinThreeMinutesOfBroadcastEvent, setWithinThreeMinutesOfBroadcastEvent] = useState<boolean>(false);
    const getWithinThreeMinutesOfEvent = useCallback(() => {
        const now = new Date().getTime();
        const eventsSoon = broadcastEvents.filter((event) => {
            const startTime = Date.parse(event.startTime);
            const endTime = Date.parse(event.endTime);
            return startTime - 3 * 60 * 1000 < now && now < endTime + 3 * 60 * 1000;
        });
        setWithinThreeMinutesOfBroadcastEvent(eventsSoon.length > 0);
    }, [broadcastEvents]);
    usePolling(getWithinThreeMinutesOfEvent, 10000, true);

    const [secondsUntilBroadcastEvent, setSecondsUntilBroadcastEvent] = useState<number>(Number.MAX_SAFE_INTEGER);
    const computeSecondsUntilBroadcastEvent = useCallback(() => {
        const now = new Date().getTime();

        if (
            broadcastEvents.find((event) => {
                const startTime = Date.parse(event.startTime);
                const endTime = Date.parse(event.endTime);
                return startTime < now && now < endTime;
            })
        ) {
            setSecondsUntilBroadcastEvent(0);
            return;
        }

        const futureEvents = R.sortBy(
            (event) => event.startTime,
            broadcastEvents.filter((event) => Date.parse(event.startTime) > now)
        );

        if (futureEvents.length > 0) {
            setSecondsUntilBroadcastEvent((Date.parse(futureEvents[0].startTime) - now) / 1000);
            return;
        }

        setSecondsUntilBroadcastEvent(Number.MAX_SAFE_INTEGER);
    }, [broadcastEvents]);
    usePolling(computeSecondsUntilBroadcastEvent, 1000, true);

    const [nextRoomEvent, setNextRoomEvent] = useState<RoomEventSummaryFragment | null>(null);
    const getNextEvent = useCallback(() => {
        const now = new Date().getTime();
        const sortedEvents = R.sortBy((event) => event.startTime, roomEvents.events);
        const futureEvents = sortedEvents.filter((event) => Date.parse(event.startTime) > now);
        setNextRoomEvent(futureEvents.length > 0 ? futureEvents[0] : null);
    }, [roomEvents.events]);

    usePolling(getNextEvent, 10000, true);

    useEffect(() => {
        getCurrentEvent();
        getWithinThreeMinutesOfEvent();
        getNextEvent();
    }, [getCurrentEvent, getNextEvent, getWithinThreeMinutesOfEvent]);

    return { currentRoomEvent, withinThreeMinutesOfBroadcastEvent, nextRoomEvent, secondsUntilBroadcastEvent };
}
