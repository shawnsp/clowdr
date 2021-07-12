import { Spinner } from "@chakra-ui/react";
import {
    CaptionControl,
    Captions,
    ClickToPlay,
    ControlGroup,
    Controls,
    ControlSpacer,
    DblClickFullscreen,
    DefaultSettings,
    FullscreenControl,
    Hls as VmHls,
    LiveIndicator,
    LoadingScreen,
    PipControl,
    PlaybackControl,
    Player,
    Poster,
    SettingsControl,
    Ui,
    VolumeControl,
} from "@vime/react";
// import type Hls from "hls.js";
import type { HlsConfig } from "hls.js";
import React, { useMemo, useState } from "react";
// import ReactPlayer from "react-player";
import useTrackView from "../../../../Realtime/Analytics/useTrackView";

function PlayerAnalytics({ isPlaying, roomId }: { isPlaying: boolean; roomId: string }) {
    useTrackView(isPlaying, roomId, "Room.HLSStream");

    return null;
}

export function HlsPlayer({
    roomId,
    hlsUri,
    canPlay,
    isMuted,
}: {
    roomId?: string;
    hlsUri: string;
    canPlay: boolean;
    isMuted?: boolean;
}): JSX.Element {
    const [isPlaying, setIsPlaying] = useState<boolean>(false);

    // const playerRef = useRef<ReactPlayer | null>(null);
    const [intendPlayStream, setIntendPlayStream] = useState<boolean>(true);
    const playerEl = useMemo(() => {
        const hlsConfig: Partial<HlsConfig> = {
            liveSyncDurationCount: 5,
            enableCEA708Captions: false,
            enableWebVTT: true,
            backBufferLength: 180,
        };
        return (
            <>
                {roomId ? <PlayerAnalytics isPlaying={isPlaying} roomId={roomId} /> : undefined}
                {/* <AspectRatio ratio={16 / 9} maxHeight="80vh" maxWidth="100%" sx={{ ".player": { maxHeight: "100%" } }}> */}
                <Player
                    playing={canPlay && intendPlayStream}
                    onPlay={() => {
                        setIsPlaying(true);
                        setIntendPlayStream(true);
                    }}
                    onPause={() => {
                        setIsPlaying(false);
                        setIntendPlayStream(false);
                    }}
                    muted={isMuted}
                    style={{ maxHeight: "100%" }}
                >
                    <VmHls version="latest" config={hlsConfig} crossOrigin="anonymous">
                        <source data-src={hlsUri} type="application/x-mpegURL" />
                    </VmHls>
                    <Ui>
                        <ClickToPlay />
                        <DblClickFullscreen />
                        <Captions />
                        <Poster />
                        <Spinner />
                        <LoadingScreen />
                        <Controls>
                            <ControlGroup space="none">
                                <PlaybackControl tooltipDirection="right" />
                                <VolumeControl />
                                <ControlSpacer />
                                <CaptionControl />
                                <LiveIndicator />
                                <PipControl />
                                <SettingsControl />
                                <FullscreenControl tooltipDirection="left" />
                            </ControlGroup>
                        </Controls>
                        <DefaultSettings />
                    </Ui>
                </Player>
                {/* <ReactPlayer
                    width="100%"
                    height="auto"
                    url={hlsUri}
                    config={{
                        file: {
                            hlsVersion: "1.0.2",
                            hlsOptions,
                        },
                    }}
                    ref={playerRef}
                    playing={canPlay && intendPlayStream}
                    controls={true}
                    muted={isMuted}
                    onEnded={() => {
                        setIsPlaying(false);
                    }}
                    onError={() => {
                        setIsPlaying(false);
                    }}
                    onPause={() => {
                        setIsPlaying(false);
                        setIntendPlayStream(false);
                    }}
                    onPlay={() => {
                        setIsPlaying(true);
                        setIntendPlayStream(true);
                    }}
                /> */}
                {/* </AspectRatio> */}
            </>
        );
    }, [hlsUri]);

    // useEffect(() => {
    //     if (playerRef.current) {
    //         const hls: Hls = playerRef.current.getInternalPlayer("hls") as Hls;
    //         if (hls) {
    //             hls.subtitleDisplay = false;
    //         }
    //     }
    // }, []);

    return playerEl;
}
