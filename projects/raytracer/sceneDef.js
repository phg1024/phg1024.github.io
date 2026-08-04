import { Point3 } from './point.js';
import { Vector3 } from './vector.js';
import { Sphere, TriangleMesh } from './shape.js';
import { Color } from './image.js';
import { Scene, makeAreaLight } from './raytracer.js';
import { bunnyVertices, bunnyFaces } from './bunnyMeshData.js';

export var SCENE_OPTIONS = [
    { value: 'current', label: 'Current Scene' },
    { value: 'bunny', label: 'Stanford Bunny' }
];

function createCurrentScene() {
    var scene = new Scene();
    scene.addObject(new Sphere(new Point3(1.0, 2.0, 1.0), 2.0, Color.LIGHTGREEN, {
        Ka: 0.1,
        Kd: 0.6,
        Ks: 0.3,
        ior: 1.75,
        refractive: true,
        transmissionColor: new Color(75, 255, 75, 255)
    }));
    scene.addObject(new Sphere(new Point3(-2.0, 2.0, 3.0), 1.5, 
    Color.DARKYELLOW, 
        { Ka: 0.1, Kd: 0.6, Ks: 0.3, ior: 1.15,
        })
    );
    scene.addObject(new Sphere(new Point3(2.0, 4.0, 8.0), 4.0, Color.LIGHTRED, { Ka: 0.1, Kd: 0.6, Ks: 0.3, ior: 0.1 }));
    scene.addObject(new Sphere(new Point3(-4.0, 4.0, 6.0), 2.0, Color.LIGHTBLUE, { Ka: 0.1, Kd: 0.9, Ks: 0.0, ior: 0.75 }));
    scene.addObject(new Sphere(new Point3(0, -1000.0, 0), 1000.0, Color.GRAY, { Ka: 0.1, Kd: 0.3, Ks: 0.1, ior: 0.25 }));
    scene.addAreaLight(makeAreaLight(
        new Point3(-6.0, 14.0, -8.0),
        new Vector3(10.0, 0.0, 0.0),
        new Vector3(0.0, 0.0, 10.0),
        Color.WHITE,
        3.0
    ));
    return scene;
}

function createBunnyScene(options) {
    var useBvh = !options || options.useBvh !== false;
    var scene = new Scene();
    scene.addObject(new TriangleMesh(
        bunnyVertices,
        bunnyFaces,
        new Color(225, 25, 25, 255),
        {
            Ka: 0.00,
            Kd: 0.5,
            Ks: 0.05,
            ior: 0.05,
            refractive: false
        },
        {
            scale: 34.0,
            offset: new Vector3(-5.0, -0.85, 8.2),
            rotateY: -Math.PI * 0.5,
            useBvh: useBvh
        }
    ));
    scene.addObject(new TriangleMesh(
        bunnyVertices,
        bunnyFaces,
        new Color(205, 255, 205, 255),
        {
            Ka: 0.02,
            Kd: 0.08,
            Ks: 0.9,
            ior: 1.45,
            refractive: true,
            transmissionColor: new Color(202, 255, 202, 255)
        },
        {
            scale: 34.0,
            offset: new Vector3(0.0, -0.7, 7.0),
            rotateY: -Math.PI * 0.5,
            useBvh: useBvh
        }
    ));
    scene.addObject(new TriangleMesh(
        bunnyVertices,
        bunnyFaces,
        new Color(125, 125, 250, 255),
        {
            Ka: 0.08,
            Kd: 0.985,
            Ks: 0.25,
            ior: 1.15,
            refractive: false,
            subsurface: 0.5,
            subsurfaceDepth: 0.15,
            subsurfaceColor: new Color(225, 225, 240, 255)
        },
        {
            scale: 34.0,
            offset: new Vector3(5.0, -0.85, 8.2),
            rotateY: -Math.PI * 0.5,
            useBvh: useBvh
        }
    ));
    scene.addObject(new Sphere(new Point3(0, -1000.0, 0), 1000.0, Color.GRAY, {Ka:0.1, Kd:0.3, Ks:0.1, ior: 0.25}));
    scene.addAreaLight(makeAreaLight(
        new Point3(-5.0, 14.0, -4.0),
        new Vector3(10.0, 0.0, 0.0),
        new Vector3(0.0, 0.0, 10.0),
        Color.WHITE,
        25.0
    ));
    return scene;
}

export function createScene(sceneId, options) {
    if (sceneId === 'bunny') {
        return createBunnyScene(options);
    }
    return createCurrentScene();
}

export function createDefaultScene() {
    return createScene('bunny');
}

export function packSceneForWebGPU(scene, options) {
    // Packing struct:
    // struct Sphere { center: vec3<f32>, radius: f32, materialIdx: u32, _pad: vec3<f32> };
    // size: 3*4 + 4 + 4 + 3*4 = 32 bytes = 8 floats per sphere
    
    // struct Material { color: vec3<f32>, kd: f32, ks: f32, ior: f32, refractive: f32, ka: f32 };
    // size: 3*4 + 4 + 4 + 4 + 4 + 4 = 32 bytes = 8 floats per material

    // struct AreaLight { center: vec3<f32>, intensity: f32, u: vec3<f32>, _pad1: f32, v: vec3<f32>, _pad2: f32, color: vec3<f32>, _pad3: f32 };
    // size: 3*4 + 4 + 3*4 + 4 + 3*4 + 4 + 3*4 + 4 = 64 bytes = 16 floats per light

    var useBvh = !options || options.useBvh !== false;
    var spheres = [];
    var triangles = [];
    var materials = [];
    var numLights = scene.areaLights.length;
    for (var objIdx = 0; objIdx < scene.objects.length; objIdx++) {
        var obj = scene.objects[objIdx];
        var materialIdx = materials.length;
        materials.push({
            color: obj.color,
            material: obj.material
        });

        if (obj.radius !== undefined) {
            spheres.push({
                center: obj.center,
                radius: obj.radius,
                materialIdx: materialIdx
            });
        } else if (obj.triangles) {
            var sourceTriangles = obj.useBvh !== false ? obj.bvhTriangles : obj.triangles;
            for (var triIdx = 0; triIdx < sourceTriangles.length; triIdx++) {
                var tri = sourceTriangles[triIdx];
                triangles.push({
                    v0: obj.vertices[tri.i0],
                    v1: obj.vertices[tri.i1],
                    v2: obj.vertices[tri.i2],
                    n0: obj.vertexNormals[tri.i0],
                    n1: obj.vertexNormals[tri.i1],
                    n2: obj.vertexNormals[tri.i2],
                    normal: tri.normal,
                    materialIdx: materialIdx,
                    boundsMin: tri.boundsMin,
                    boundsMax: tri.boundsMax,
                    centroid: tri.centroid
                });
            }
        }
    }

    var sphereBuffer = new Float32Array(Math.max(1, spheres.length) * 8);
    var materialBuffer = new Float32Array(Math.max(1, materials.length) * 16);
    var triangleBuffer = new Float32Array(Math.max(1, triangles.length) * 24);
    var bvhNodes = useBvh ? buildTriangleBVH(triangles) : buildFlatTriangleLeaf(triangles);
    var bvhNodeBuffer = new Float32Array(Math.max(1, bvhNodes.length) * 12);
    var lightBuffer = new Float32Array(Math.max(1, numLights) * 16);

    for (var i = 0; i < spheres.length; i++) {
        var obj = spheres[i];
        var baseIdx = i * 8;
        sphereBuffer[baseIdx + 0] = obj.center.x;
        sphereBuffer[baseIdx + 1] = obj.center.y;
        sphereBuffer[baseIdx + 2] = obj.center.z;
        sphereBuffer[baseIdx + 3] = obj.radius;
        sphereBuffer[baseIdx + 4] = obj.materialIdx;
        // pad remains 0
    }

    for (var i = 0; i < materials.length; i++) {
        var mat = materials[i].material;
        var c = materials[i].color;
        var baseIdx = i * 16;
        materialBuffer[baseIdx + 0] = c.r / 255.0;
        materialBuffer[baseIdx + 1] = c.g / 255.0;
        materialBuffer[baseIdx + 2] = c.b / 255.0;
        materialBuffer[baseIdx + 3] = mat.Kd !== undefined ? mat.Kd : 0.6;
        materialBuffer[baseIdx + 4] = mat.Ks !== undefined ? mat.Ks : 0.3;
        materialBuffer[baseIdx + 5] = mat.ior !== undefined ? mat.ior : 1.5;
        materialBuffer[baseIdx + 6] = mat.refractive ? 1.0 : 0.0;
        materialBuffer[baseIdx + 7] = mat.Ka !== undefined ? mat.Ka : 0.1;
        materialBuffer[baseIdx + 8] = mat.subsurfaceColor ? mat.subsurfaceColor.r / 255.0 : materialBuffer[baseIdx + 0];
        materialBuffer[baseIdx + 9] = mat.subsurfaceColor ? mat.subsurfaceColor.g / 255.0 : materialBuffer[baseIdx + 1];
        materialBuffer[baseIdx + 10] = mat.subsurfaceColor ? mat.subsurfaceColor.b / 255.0 : materialBuffer[baseIdx + 2];
        materialBuffer[baseIdx + 11] = mat.subsurface !== undefined ? mat.subsurface : 0.0;
        materialBuffer[baseIdx + 12] = mat.subsurfaceDepth !== undefined ? mat.subsurfaceDepth : 0.35;
        var transmissionColor = mat.transmissionColor || (mat.refractive ? Color.WHITE : c);
        materialBuffer[baseIdx + 13] = transmissionColor.r / 255.0;
        materialBuffer[baseIdx + 14] = transmissionColor.g / 255.0;
        materialBuffer[baseIdx + 15] = transmissionColor.b / 255.0;
    }

    for (var i = 0; i < triangles.length; i++) {
        var tri = triangles[i];
        var baseIdx = i * 24;
        triangleBuffer[baseIdx + 0] = tri.v0.x;
        triangleBuffer[baseIdx + 1] = tri.v0.y;
        triangleBuffer[baseIdx + 2] = tri.v0.z;
        triangleBuffer[baseIdx + 3] = tri.materialIdx;
        triangleBuffer[baseIdx + 4] = tri.v1.x;
        triangleBuffer[baseIdx + 5] = tri.v1.y;
        triangleBuffer[baseIdx + 6] = tri.v1.z;
        triangleBuffer[baseIdx + 7] = 0;
        triangleBuffer[baseIdx + 8] = tri.v2.x;
        triangleBuffer[baseIdx + 9] = tri.v2.y;
        triangleBuffer[baseIdx + 10] = tri.v2.z;
        triangleBuffer[baseIdx + 11] = 0;
        triangleBuffer[baseIdx + 12] = tri.n0.x;
        triangleBuffer[baseIdx + 13] = tri.n0.y;
        triangleBuffer[baseIdx + 14] = tri.n0.z;
        triangleBuffer[baseIdx + 15] = 0;
        triangleBuffer[baseIdx + 16] = tri.n1.x;
        triangleBuffer[baseIdx + 17] = tri.n1.y;
        triangleBuffer[baseIdx + 18] = tri.n1.z;
        triangleBuffer[baseIdx + 19] = 0;
        triangleBuffer[baseIdx + 20] = tri.n2.x;
        triangleBuffer[baseIdx + 21] = tri.n2.y;
        triangleBuffer[baseIdx + 22] = tri.n2.z;
        triangleBuffer[baseIdx + 23] = 0;
    }

    for (var i = 0; i < bvhNodes.length; i++) {
        var node = bvhNodes[i];
        var baseIdx = i * 12;
        bvhNodeBuffer[baseIdx + 0] = node.boundsMin.x;
        bvhNodeBuffer[baseIdx + 1] = node.boundsMin.y;
        bvhNodeBuffer[baseIdx + 2] = node.boundsMin.z;
        bvhNodeBuffer[baseIdx + 3] = node.left;
        bvhNodeBuffer[baseIdx + 4] = node.boundsMax.x;
        bvhNodeBuffer[baseIdx + 5] = node.boundsMax.y;
        bvhNodeBuffer[baseIdx + 6] = node.boundsMax.z;
        bvhNodeBuffer[baseIdx + 7] = node.right;
        bvhNodeBuffer[baseIdx + 8] = node.start;
        bvhNodeBuffer[baseIdx + 9] = node.count;
        bvhNodeBuffer[baseIdx + 10] = 0;
        bvhNodeBuffer[baseIdx + 11] = 0;
    }

    if (numLights > 0) {
        for (var i = 0; i < numLights; i++) {
            var light = scene.areaLights[i];
            var baseIdx = i * 16;
            lightBuffer[baseIdx + 0] = light.center.x;
            lightBuffer[baseIdx + 1] = light.center.y;
            lightBuffer[baseIdx + 2] = light.center.z;
            lightBuffer[baseIdx + 3] = light.intensity;
            
            lightBuffer[baseIdx + 4] = light.u.x;
            lightBuffer[baseIdx + 5] = light.u.y;
            lightBuffer[baseIdx + 6] = light.u.z;
            lightBuffer[baseIdx + 7] = 0; // pad
            
            lightBuffer[baseIdx + 8] = light.v.x;
            lightBuffer[baseIdx + 9] = light.v.y;
            lightBuffer[baseIdx + 10] = light.v.z;
            lightBuffer[baseIdx + 11] = 0; // pad
            
            lightBuffer[baseIdx + 12] = light.color.r / 255.0;
            lightBuffer[baseIdx + 13] = light.color.g / 255.0;
            lightBuffer[baseIdx + 14] = light.color.b / 255.0;
            lightBuffer[baseIdx + 15] = 0; // pad
        }
    }

    return {
        spheres: sphereBuffer,
        triangles: triangleBuffer,
        bvhNodes: bvhNodeBuffer,
        materials: materialBuffer,
        lights: lightBuffer,
        numSpheres: spheres.length,
        numTriangles: triangles.length,
        numBvhNodes: bvhNodes.length,
        numLights: numLights
    };
}

function buildTriangleBVH(triangles) {
    if (!triangles.length) {
        return [{
            boundsMin: new Point3(0, 0, 0),
            boundsMax: new Point3(0, 0, 0),
            left: 0,
            right: 0,
            start: 0,
            count: 0
        }];
    }

    var nodes = [];

    function computeBounds(start, end) {
        var min = new Point3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        var max = new Point3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
        var centroidMin = new Point3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        var centroidMax = new Point3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

        for (var i = start; i < end; i++) {
            var tri = triangles[i];
            min.x = Math.min(min.x, tri.boundsMin.x);
            min.y = Math.min(min.y, tri.boundsMin.y);
            min.z = Math.min(min.z, tri.boundsMin.z);
            max.x = Math.max(max.x, tri.boundsMax.x);
            max.y = Math.max(max.y, tri.boundsMax.y);
            max.z = Math.max(max.z, tri.boundsMax.z);
            centroidMin.x = Math.min(centroidMin.x, tri.centroid.x);
            centroidMin.y = Math.min(centroidMin.y, tri.centroid.y);
            centroidMin.z = Math.min(centroidMin.z, tri.centroid.z);
            centroidMax.x = Math.max(centroidMax.x, tri.centroid.x);
            centroidMax.y = Math.max(centroidMax.y, tri.centroid.y);
            centroidMax.z = Math.max(centroidMax.z, tri.centroid.z);
        }

        return {
            min: min,
            max: max,
            centroidMin: centroidMin,
            centroidMax: centroidMax
        };
    }

    function build(start, end) {
        var bounds = computeBounds(start, end);
        var nodeIndex = nodes.length;
        var node = {
            boundsMin: bounds.min,
            boundsMax: bounds.max,
            left: 0,
            right: 0,
            start: 0,
            count: 0
        };
        nodes.push(node);

        if (end - start <= 8) {
            node.start = start;
            node.count = end - start;
            return nodeIndex;
        }

        var extents = [
            bounds.centroidMax.x - bounds.centroidMin.x,
            bounds.centroidMax.y - bounds.centroidMin.y,
            bounds.centroidMax.z - bounds.centroidMin.z
        ];
        var axis = 0;
        if (extents[1] > extents[axis]) axis = 1;
        if (extents[2] > extents[axis]) axis = 2;
        if (extents[axis] < 1e-8) {
            node.start = start;
            node.count = end - start;
            return nodeIndex;
        }

        var slice = triangles.slice(start, end);
        slice.sort(function(a, b) {
            return axis === 0 ? a.centroid.x - b.centroid.x : axis === 1 ? a.centroid.y - b.centroid.y : a.centroid.z - b.centroid.z;
        });
        for (var i = 0; i < slice.length; i++) {
            triangles[start + i] = slice[i];
        }

        var mid = Math.floor((start + end) / 2);
        node.left = build(start, mid);
        node.right = build(mid, end);
        return nodeIndex;
    }

    build(0, triangles.length);
    return nodes;
}

function buildFlatTriangleLeaf(triangles) {
    if (!triangles.length) {
        return [{
            boundsMin: new Point3(0, 0, 0),
            boundsMax: new Point3(0, 0, 0),
            left: 0,
            right: 0,
            start: 0,
            count: 0
        }];
    }

    var min = new Point3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    var max = new Point3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

    for (var i = 0; i < triangles.length; i++) {
        var tri = triangles[i];
        min.x = Math.min(min.x, tri.boundsMin.x);
        min.y = Math.min(min.y, tri.boundsMin.y);
        min.z = Math.min(min.z, tri.boundsMin.z);
        max.x = Math.max(max.x, tri.boundsMax.x);
        max.y = Math.max(max.y, tri.boundsMax.y);
        max.z = Math.max(max.z, tri.boundsMax.z);
    }

    return [{
        boundsMin: min,
        boundsMax: max,
        left: 0,
        right: 0,
        start: 0,
        count: triangles.length
    }];
}
