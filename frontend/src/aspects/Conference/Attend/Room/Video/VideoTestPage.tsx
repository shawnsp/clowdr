import { chakra, Heading } from "@chakra-ui/react";
import React from "react";
import { HlsPlayer } from "./HlsPlayer";

export function VideoTestPage(): JSX.Element {
    const aspectRatio: number = 16 / 9;
    const maxWidth = 90;
    const heightFromWidth = maxWidth / aspectRatio;
    const maxHeight = 90;
    const widthFromHeight = maxHeight * aspectRatio;

    return (
        <>
            <Heading as="h1">Video player test</Heading>

            <chakra.div
                width={`${maxWidth}vw`}
                height={`${heightFromWidth}vw`}
                maxHeight={`${maxHeight}vh`}
                maxWidth={`${widthFromHeight}vh`}
                sx={{
                    "vm-player": {
                        maxHeight: "100%",
                    },
                }}
            >
                <HlsPlayer
                    canPlay={true}
                    hlsUri="https://wowzaec2demo.streamlock.net/live/bigbuckbunny/playlist.m3u8"
                />
            </chakra.div>
        </>
    );
}
