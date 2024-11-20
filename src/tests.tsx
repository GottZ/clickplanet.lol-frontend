import {useEffect} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

export default function AppV4() {
    useEffect(() => {
        // Initialisation de la scène, de la caméra et du rendu
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('three-container')!.appendChild(renderer.domElement);

        const {positions, ids, size} = generatePositions(130);
        console.log(size)

        const colors = new Float32Array(size * 3);

        for (let i = 0; i < size; i++) {
            const [r, g, b] = integerToColor(i + 1); // add +1 to avoid black color (background)
            colors[i * 3] = r / 255;
            colors[i * 3 + 1] = g / 255;
            colors[i * 3 + 2] = b / 255; // divide by 255 to get a value between 0 and 1 (required by three.js)
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const points = new THREE.Points(geometry, new THREE.ShaderMaterial({
            vertexShader: `
                attribute vec3 color;
                varying vec3 vColor;
                
                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = 1.0 * (2.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                void main() {
                    gl_FragColor = vec4(vColor, 1.0);
                }
            `
        }));

        scene.add(new THREE.AmbientLight(0xffffff, 1));
        scene.add(points)
        const icosahedron = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.9999, 16),
            new THREE.MeshStandardMaterial({
                map: new THREE.TextureLoader().load('/static/earth/3_no_ice_clouds_8k.jpg'),
            })
        );

        scene.add(icosahedron);

        window.addEventListener('click', (event: MouseEvent) => {
            const mouse = new THREE.Vector2();
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            const pixelBuffer = new Uint8Array(4);

            const renderTarget = new THREE.WebGLRenderTarget(
                window.innerWidth,
                window.innerHeight,
            );

            renderer.setRenderTarget(renderTarget);
            renderer.render(scene, camera);
            renderer.setRenderTarget(null);

            renderer.readRenderTargetPixels(
                renderTarget,
                Math.floor(((mouse.x + 1) / 2) * window.innerWidth),
                Math.floor(((mouse.y + 1) / 2) * window.innerHeight),
                1, 1, pixelBuffer
            )

            console.log(pixelBuffer)

            const originalId = colorToInteger([pixelBuffer[0], pixelBuffer[1], pixelBuffer[2]]);
            console.log(originalId)
        })

        // Position de la caméra
        camera.position.z = 5;

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.maxDistance = 4
        controls.minDistance = 1.1


        // Animation
        const animate = () => {
            requestAnimationFrame(animate);
            controls.update()
            renderer.render(scene, camera);
        };

        animate();

        // Cleanup pour éviter les fuites mémoire
        return () => {
            renderer.dispose();
            document.getElementById('three-container')!.innerHTML = '';
        };
    }, []);

    return <div id="three-container" style={{width: '100vw', height: '100vh'}}/>;
};

function integerToColor(id: number): [number, number, number] {
    const r = (id >> 16) & 0xff;
    const g = (id >> 8) & 0xff;
    const b = id & 0xff;

    return [r, g, b];
}

function colorToInteger(rgb: [number, number, number]): number {
    return (rgb[0] << 16) + (rgb[1] << 8) + rgb[2];
}

function generatePositions(detail: number) {
    if (detail < 1) detail = 1;
    if (detail > 520) detail = 520;

    const geometry = new THREE.IcosahedronGeometry(1, detail);
    const pos = geometry.attributes.position.array;
    const uv = geometry.attributes.uv.array;

    // Générer des IDs uniques
    const ids = new Float32Array(pos.length / 3);

    for (let i = 0; i < ids.length; i++) ids[i] = i;

    return {
        positions: new Float32Array(pos),
        uv: new Float32Array(uv),
        ids: ids,
        size: pos.length / 3,
    };
}