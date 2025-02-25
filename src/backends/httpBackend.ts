import {Ownerships, OwnershipsGetter, TileClicker, UpdatesListener} from "./backend.ts";
import {
    ClickRequest, OwnershipBatchRequest,
    Ownerships as OwnershipsProto, TileUpdate,
} from "../gen/grpc/clicks_pb.ts";
import {Message} from "@bufbuild/protobuf";

type Config = {
    baseUrl: string
    timeoutMs?: number
}

export class ClickServiceClient {
    constructor(public config: Config) {
    }

    public async fetch(
        verb: string,
        path: string,
        body?: Message
    ): Promise<Uint8Array | undefined> {
        const url = this.config.baseUrl + path

        let res: Response | undefined

        for (let i = 0; i < 5; i++) {
            try {
                res = await fetch(url, {
                    method: verb,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: body ? JSON.stringify({
                        data: Array.from(body?.toBinary())
                    }) : null,
                    signal: AbortSignal.timeout(this.config.timeoutMs || 5000)
                })
            } catch (e) {
                console.error(i, "Failed to fetch", e)
            }
            if (res) {
                break
            }
        }

        if (!res) {
            throw new Error(`Failed to fetch ${verb} ${path}`)
        }

        if (!res.ok) {
            throw new Error(`Failed to fetch ${verb} ${path}: ${res.statusText} ${await res.text()}`)
        }

        const json = await res!.json()
        const base64String = json.data
        if (!base64String) {
            return undefined
        }
        const binaryString = atob(base64String);

        const uint8Array = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            uint8Array[i] = binaryString.charCodeAt(i);
        }

        return uint8Array
    }
}

export class HTTPBackend implements TileClicker, OwnershipsGetter, UpdatesListener {
    constructor(private client: ClickServiceClient) {
    }

    public async clickTile(tileId: number, countryId: string) {
        const payload = new ClickRequest({
            tileId: tileId,
            countryId: countryId,
        })

        await this.client.fetch("POST", "/api/click", payload)
    }

    public async getCurrentOwnerships(): Promise<Ownerships> {
        const binary = await this.client.fetch("GET", "/api/ownerships", undefined)
        const message = OwnershipsProto.fromBinary(binary!)
        return {
            bindings: new Map<number, string>(
                Object.entries(message.bindings).map(([k, v]) => [parseInt(k), v]))
        }
    }

    public async getCurrentOwnershipsByBatch(
        batchSize: number,
        maxIndex: number,
        callback: (ownerships: Ownerships) => void,
    ) {
        for (let i = 0; i < maxIndex; i += batchSize) {
            const payload = new OwnershipBatchRequest({
                endTileId: i + batchSize,
                startTileId: i,
            })

            const binary = await this.client.fetch("POST", "/api/ownerships-by-batch", payload)
            const message = OwnershipsProto.fromBinary(binary!)

            callback({
                bindings: new Map<number, string>(
                    Object.entries(message.bindings).map(([k, v]) => [parseInt(k), v]))
            })
        }
    }

    public listenForUpdates(callback: (tile: number, previousCountry: string | undefined, newCountry: string) => void): () => void {
        const websocket = new WebSocket(`wss://${window.location.host}/ws/listen`)
        // const websocket = new WebSocket(`wss://clickplanet.lol/ws/listen`)
        websocket.binaryType = "arraybuffer";
        websocket.addEventListener('message', (event) => {
            const binary = new Uint8Array(event.data)
            const message = TileUpdate.fromBinary(binary)
            callback(
                message.tileId,
                message.previousCountryId === "" ? undefined : message.previousCountryId,
                message.countryId,
            )
        })

        return () => websocket.close
    }
}