import OT from "@opentok/client";
import { Mutex } from "async-mutex";
import * as R from "ramda";
import { Observable } from "../../../../Observable";

export type CameraResolutions = "640x480" | "1280x720";

export enum StateType {
    Uninitialised,
    Initialised,
    Connected,
}
type StateData = UninitialisedStateData | InitialisedStateData | ConnectedStateData;

interface UninitialisedStateData {
    type: StateType.Uninitialised;
}

interface InitialisedStateData {
    type: StateType.Initialised;
    getToken: (sessionId: string) => Promise<string>;
    sessionId: string;
    onStreamsChanged: (streams: OT.Stream[]) => void;
    onConnectionsChanged: (connections: OT.Connection[]) => void;
    onSessionConnected: (isConnected: boolean) => void;
    onCameraStreamDestroyed: (reason: string) => void;
    onScreenStreamDestroyed: (reason: string) => void;
    screenSharingSupported: boolean;
    onCameraStreamCreated: () => void;
    onScreenStreamCreated: () => void;
}

interface ConnectedStateData {
    type: StateType.Connected;
    initialisedState: InitialisedStateData;
    session: OT.Session;
    camera: null | {
        videoDeviceId: string | null;
        audioDeviceId: string | null;
        publisher: OT.Publisher;
        initialisedWithVideo: boolean;
        initialisedWithAudio: boolean;
    };
    screen: null | OT.Publisher;
    streams: OT.Stream[];
    connections: OT.Connection[];
}

export class VonageGlobalState {
    private mutex: Mutex = new Mutex();

    private _state: StateData = { type: StateType.Uninitialised };
    public get state(): StateData {
        return this._state;
    }
    public set state(value: StateData) {
        const wasConnected = this._state.type === StateType.Connected;
        this._state = value;
        const isConnected = this._state.type === StateType.Connected;

        if (wasConnected !== isConnected) {
            this.IsConnected.publish(isConnected);
        }
    }
    public IsConnected = new Observable<boolean>((observer) => {
        observer(this.state.type === StateType.Connected);
    });

    public get camera(): OT.Publisher | null {
        return this.state.type === StateType.Connected ? this.state.camera?.publisher ?? null : null;
    }

    public get screen(): OT.Publisher | null {
        return this.state.type === StateType.Connected ? this.state.screen : null;
    }

    public async initialiseState(
        getToken: (sessionId: string) => Promise<string>,
        sessionId: string,
        onStreamsChanged: (streams: OT.Stream[]) => void,
        onConnectionsChanged: (connections: OT.Connection[]) => void,
        onSessionConnected: (isConnected: boolean) => void,
        onCameraStreamDestroyed: (reason: string) => void,
        onScreenStreamDestroyed: (reason: string) => void,
        onCameraStreamCreated: () => void,
        onScreenStreamCreated: () => void
    ): Promise<void> {
        const release = await this.mutex.acquire();
        try {
            // todo: disconnect from previous session etc if initialised.
            if (this.state.type === StateType.Connected) {
                throw new Error("Invalid state transition: must not be connected when initialising");
            }

            const screenSharingSupported = await new Promise<boolean>((resolve) => {
                OT.checkScreenSharingCapability((response) => {
                    if (!response.supported || response.extensionRegistered === false) {
                        // This browser does not support screen sharing
                        return resolve(false);
                    }
                    return resolve(true);
                });
            });

            this.state = {
                type: StateType.Initialised,
                getToken,
                sessionId,
                onStreamsChanged,
                onConnectionsChanged,
                onSessionConnected,
                onCameraStreamDestroyed,
                onScreenStreamDestroyed,
                screenSharingSupported,
                onCameraStreamCreated,
                onScreenStreamCreated,
            };
        } catch (e) {
            console.error("VonageGlobalState: initialiseState failure", e);
            throw e;
        } finally {
            release();
        }
    }

    public async connectToSession(): Promise<void> {
        const release = await this.mutex.acquire();
        try {
            if (this.state.type !== StateType.Initialised) {
                throw new Error("Invalid state transition: must be initialised");
            }

            const session = OT.initSession(import.meta.env.SNOWPACK_PUBLIC_OPENTOK_API_KEY, this.state.sessionId, {});
            const token = await this.state.getToken(this.state.sessionId);

            session.on("streamCreated", (event) =>
                this.onStreamCreated(event).catch((e) =>
                    console.error("VonageGlobalState: error handling streamCreated", e)
                )
            );
            session.on("streamDestroyed", (event) =>
                this.onStreamDestroyed(event).catch((e) =>
                    console.error("VonageGlobalState: error handling streamDestroyed", e)
                )
            );
            session.on("connectionCreated", (event) =>
                this.onConnectionCreated(event).catch((e) =>
                    console.error("VonageGlobalState: error handling connectionCreated", e)
                )
            );
            session.on("connectionDestroyed", (event) =>
                this.onConnectionDestroyed(event).catch((e) =>
                    console.error("VonageGlobalState: error handling connectionDestroyed", e)
                )
            );
            session.on("sessionConnected", (event) =>
                this.onSessionConnected(event).catch((e) =>
                    console.error("VonageGlobalState: error handling sessionConnected", e)
                )
            );
            session.on("sessionDisconnected", (event) =>
                this.onSessionDisconnected(event).catch((e) =>
                    console.error("VonageGlobalState: error handling sessionDisconnected", e)
                )
            );

            await new Promise<void>((resolve, reject) => {
                session.connect(token, (error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            this.state = {
                type: StateType.Connected,
                initialisedState: this.state,
                session,
                camera: null,
                screen: null,
                streams: [],
                connections: [],
            };
        } catch (e) {
            console.error("VonageGlobalState: connectToSession failure", e);
            throw e;
        } finally {
            release();
        }
    }

    public async publishCamera(
        targetElement: string | HTMLElement,
        videoDeviceId: string | null,
        audioDeviceId: string | null,
        resolution: CameraResolutions = "640x480"
    ): Promise<void> {
        const frameRate = resolution === "1280x720" ? 30 : 15;

        const release = await this.mutex.acquire();
        let _publisher: OT.Publisher | undefined;
        try {
            if (this.state.type !== StateType.Connected) {
                throw new Error("Invalid state transition: must be connected");
            }

            const state = this.state;

            if (!videoDeviceId && !audioDeviceId) {
                if (state.camera) {
                    state.session.unpublish(state.camera.publisher);
                    state.camera.publisher.destroy();

                    this.state = {
                        ...this.state,
                        camera: null,
                    };
                    state.initialisedState.onCameraStreamDestroyed("mediaStopped");
                }
            } else if (state.camera) {
                if (state.camera.audioDeviceId === audioDeviceId && state.camera.videoDeviceId === videoDeviceId) {
                    // Nothing to do here!
                    return;
                }

                // We must republish if the publisher did not originally have one of the media types enabled
                const mustRepublish =
                    (!state.camera.initialisedWithAudio && audioDeviceId) ||
                    (!state.camera.initialisedWithVideo && videoDeviceId);

                if (mustRepublish) {
                    // First unpublish and destroy the existing publisher
                    state.session.unpublish(state.camera.publisher);
                    state.camera.publisher.destroy();

                    // Now re-initialise with a new publisher
                    const publisher = OT.initPublisher(targetElement, {
                        publishAudio: !!audioDeviceId,
                        publishVideo: !!videoDeviceId,
                        audioSource: audioDeviceId,
                        videoSource: videoDeviceId,
                        resolution,
                        frameRate,
                        width: "100%",
                        height: "100%",
                        insertMode: "append",
                        showControls: false,
                    });

                    _publisher = publisher;

                    await new Promise<void>((resolve, reject) => {
                        state.session.publish(publisher, (error: OT.OTError | undefined) => {
                            if (error) {
                                reject(error);
                            } else {
                                resolve();
                            }
                        });
                    });
                    publisher.on("streamDestroyed", (event) =>
                        this.onCameraStreamDestroyed(event).catch((e) =>
                            console.error("VonageGlobalState: error handling streamDestroyed", e)
                        )
                    );

                    this.state = {
                        ...state,
                        camera: {
                            audioDeviceId,
                            videoDeviceId,
                            initialisedWithAudio: !!audioDeviceId,
                            initialisedWithVideo: !!videoDeviceId,
                            publisher,
                        },
                    };
                    this.state.initialisedState.onCameraStreamCreated();
                } else {
                    // Otherwise, we can simply switch the sources
                    if (audioDeviceId !== state.camera.audioDeviceId) {
                        if (audioDeviceId) {
                            await state.camera.publisher.setAudioSource(audioDeviceId);
                            state.camera.publisher.publishAudio(true);
                        } else {
                            state.camera.publisher.publishAudio(false);
                        }
                    }

                    if (videoDeviceId !== state.camera.videoDeviceId) {
                        if (videoDeviceId) {
                            await state.camera.publisher.setVideoSource(videoDeviceId);
                            state.camera.publisher.publishVideo(true);
                        } else {
                            state.camera.publisher.publishVideo(false);
                        }
                    }

                    this.state = {
                        ...state,
                        camera: {
                            ...state.camera,
                            audioDeviceId,
                            videoDeviceId,
                        },
                    };
                }
            } else {
                const publisher = OT.initPublisher(targetElement, {
                    publishAudio: !!audioDeviceId,
                    publishVideo: !!videoDeviceId,
                    audioSource: audioDeviceId,
                    videoSource: videoDeviceId,
                    resolution,
                    frameRate,
                    width: "100%",
                    height: "100%",
                    insertMode: "append",
                    showControls: false,
                });

                _publisher = publisher;

                await new Promise<void>((resolve, reject) => {
                    state.session.publish(publisher, (error: OT.OTError | undefined) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    });
                });
                publisher.on("streamDestroyed", (event) =>
                    this.onCameraStreamDestroyed(event).catch((_e) =>
                        console.error("VonageGlobalState: error handling streamDestroyed")
                    )
                );

                this.state = {
                    ...state,
                    camera: {
                        audioDeviceId,
                        videoDeviceId,
                        initialisedWithAudio: !!audioDeviceId,
                        initialisedWithVideo: !!videoDeviceId,
                        publisher,
                    },
                };
                this.state.initialisedState.onCameraStreamCreated();
            }
        } catch (e) {
            console.error("VonageGlobalState: publishCamera failure", e);
            if (_publisher) {
                _publisher.destroy();
            }
            if (this.state.type === StateType.Connected) {
                this.state.initialisedState.onCameraStreamDestroyed("mediaStopped");
            }
            throw e;
        } finally {
            release();
        }
    }

    public async publishScreen(screenPublishContainerRef: HTMLElement | string): Promise<void> {
        const release = await this.mutex.acquire();
        let _publisher: OT.Publisher | undefined;
        try {
            if (this.state.type !== StateType.Connected) {
                throw new Error("Invalid state transition: must be connected to publish screen");
            }

            const state = this.state;

            if (this.state.screen) {
                throw new Error("Screen is already published");
            }

            const publisher = OT.initPublisher(screenPublishContainerRef, {
                videoSource: "screen",
                resolution: "1280x720",
                width: "100%",
                height: "100%",
                insertMode: "append",
                showControls: false,
            });

            _publisher = publisher;

            await new Promise<void>((resolve, reject) => {
                state.session.publish(publisher, (error: OT.OTError | undefined) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });
            publisher.on("streamDestroyed", (event) =>
                this.onScreenStreamDestroyed(event).catch((e) =>
                    console.error("VonageGlobalState: error handling streamDestroyed", e)
                )
            );

            this.state = {
                ...this.state,
                screen: publisher,
            };
            this.state.initialisedState.onScreenStreamCreated();
        } catch (e) {
            console.error("VonageGlobalState: publishScreen failure", e);
            if (_publisher) {
                _publisher.destroy();
            }
            if (this.state.type === StateType.Connected) {
                this.state.initialisedState.onScreenStreamDestroyed("mediaStopped");
            }
            throw e;
        } finally {
            release();
        }
    }

    public async unpublishScreen(): Promise<void> {
        const release = await this.mutex.acquire();
        try {
            if (this.state.type !== StateType.Connected) {
                throw new Error("Invalid state transition: must be connected to unpublish screen");
            }

            if (!this.state.screen) {
                throw new Error("Screen is already unpublished");
            }

            this.state.session.unpublish(this.state.screen);

            this.state = {
                ...this.state,
                screen: null,
            };
            this.state.initialisedState.onScreenStreamDestroyed("unpublished");
        } catch (e) {
            console.error("VonageGlobalState: unpublishScreen failure", e);
            throw e;
        } finally {
            release();
        }
    }

    public async disconnect(): Promise<void> {
        const release = await this.mutex.acquire();
        try {
            if (this.state.type !== StateType.Connected) {
                throw new Error("Invalid state transition: must be connected to disconnect");
            }

            if (this.state.camera) {
                this.state.session.unpublish(this.state.camera.publisher);
                this.state.camera.publisher.destroy();
            }

            if (this.state.screen) {
                this.state.session.unpublish(this.state.screen);
                this.state.screen.destroy();
            }

            this.state.session.off();
            this.state.session.disconnect();

            const callback = this.state.initialisedState.onSessionConnected;
            // TODO: handle exceptions

            this.state = {
                ...this.state.initialisedState,
            };

            callback(false);
        } catch (e) {
            console.error("VonageGlobalState: disconnect failure", e);
            throw e;
        } finally {
            release();
        }
    }

    private async onStreamCreated(event: OT.Event<"streamCreated", OT.Session> & { stream: OT.Stream }): Promise<void> {
        const release = await this.mutex.acquire();
        try {
            if (this.state.type !== StateType.Connected) {
                throw new Error("Invalid state transition: must be connected to add stream");
            }

            this.state = {
                ...this.state,
                streams: R.uniqBy((stream) => stream.streamId, [...this.state.streams, event.stream]),
            };

            this.state.initialisedState.onStreamsChanged(this.state.streams);
        } catch (e) {
            console.error("VonageGlobalState: onStreamCreated failure", e);
            throw e;
        } finally {
            release();
        }
    }

    private async onStreamDestroyed(
        event: OT.Event<"streamDestroyed", OT.Session> & { stream: OT.Stream }
    ): Promise<void> {
        const release = await this.mutex.acquire();
        try {
            if (this.state.type !== StateType.Connected) {
                throw new Error("Invalid state transition: must be connected to remove stream");
            }

            this.state = {
                ...this.state,
                streams: this.state.streams.filter((x) => x.streamId !== event.stream.streamId),
            };

            this.state.initialisedState.onStreamsChanged(this.state.streams);
        } catch (e) {
            console.error("VonageGlobalState: onStreamDestroyed failure", e);
            throw e;
        } finally {
            release();
        }
    }

    private async onConnectionCreated(
        event: OT.Event<"connectionCreated", OT.Session> & { connection: OT.Connection }
    ): Promise<void> {
        const release = await this.mutex.acquire();
        try {
            if (this.state.type !== StateType.Connected) {
                throw new Error("Invalid state transition: must be connected to add connection");
            }

            this.state = {
                ...this.state,
                connections: R.uniqBy((connection) => connection.connectionId, [
                    ...this.state.connections,
                    event.connection,
                ]),
            };

            this.state.initialisedState.onConnectionsChanged(this.state.connections);
        } catch (e) {
            console.error("VonageGlobalState: onConnectionCreated failure", e);
            throw e;
        } finally {
            release();
        }
    }

    private async onConnectionDestroyed(
        event: OT.Event<"connectionDestroyed", OT.Session> & { connection: OT.Connection }
    ): Promise<void> {
        const release = await this.mutex.acquire();
        try {
            if (this.state.type !== StateType.Connected) {
                throw new Error("Invalid state transition: must be connected to add connection");
            }

            this.state = {
                ...this.state,
                connections: this.state.connections.filter((x) => x.connectionId !== event.connection.connectionId),
            };

            this.state.initialisedState.onConnectionsChanged(this.state.connections);
        } catch (e) {
            console.error("VonageGlobalState: onConnectionDestroyed failure", e);
            throw e;
        } finally {
            release();
        }
    }

    private async onSessionDisconnected(event: OT.Event<"sessionDisconnected", OT.Session>): Promise<void> {
        const release = await this.mutex.acquire();
        try {
            if (this.state.type !== StateType.Connected) {
                throw new Error("Invalid state transition: must be connected to disconnect");
            }

            event.preventDefault();

            const callback = this.state.initialisedState.onSessionConnected;
            this.state.session.off();

            this.state = {
                ...this.state.initialisedState,
                type: StateType.Initialised,
            };

            callback(false);
        } catch (e) {
            console.error("VonageGlobalState: onSessionDisconnected failure", e);
            throw e;
        } finally {
            release();
        }
    }

    private async onSessionConnected(_event: OT.Event<"sessionConnected", OT.Session>): Promise<void> {
        const release = await this.mutex.acquire();
        try {
            if (this.state.type === StateType.Uninitialised) {
                throw new Error("Invalid state transition: must be connected to disconnect");
            }

            let callback;
            if (this.state.type === StateType.Initialised) {
                callback = this.state.onSessionConnected;
            } else {
                callback = this.state.initialisedState.onSessionConnected;
            }

            callback(true);
        } catch (e) {
            console.error("VonageGlobalState: onSessionConnected failure", e);
            throw e;
        } finally {
            release();
        }
    }

    private async onCameraStreamDestroyed(
        event: OT.Event<"streamDestroyed", OT.Publisher> & { stream: OT.Stream; reason: string }
    ): Promise<void> {
        const release = await this.mutex.acquire();
        try {
            if (this.state.type === StateType.Initialised) {
                this.state.onCameraStreamDestroyed(event.reason);
            } else if (this.state.type === StateType.Connected) {
                this.state.initialisedState.onCameraStreamDestroyed(event.reason);
            }
        } catch (e) {
            console.error("VonageGlobalState: onCameraStreamDestroyed failure", e);
            throw e;
        } finally {
            release();
        }
    }

    private async onScreenStreamDestroyed(
        event: OT.Event<"streamDestroyed", OT.Publisher> & { stream: OT.Stream; reason: string }
    ): Promise<void> {
        const release = await this.mutex.acquire();
        try {
            if (this.state.type === StateType.Initialised) {
                this.state.onScreenStreamDestroyed(event.reason);
            } else if (this.state.type === StateType.Connected) {
                this.state.initialisedState.onScreenStreamDestroyed(event.reason);
            }
        } catch (e) {
            console.error("VonageGlobalState: onScreenStreamDestroyed failure", e);
            throw e;
        } finally {
            release();
        }
    }

    constructor() {
        // todo
    }
}

export const State = new VonageGlobalState();
