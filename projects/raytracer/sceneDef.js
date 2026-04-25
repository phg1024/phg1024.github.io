import { Point3 } from './point.js';
import { Vector3 } from './vector.js';
import { Sphere } from './shape.js';
import { Color } from './image.js';
import { Scene, makeAreaLight } from './raytracer.js';

export function createDefaultScene() {
    var scene = new Scene();
    scene.addObject(new Sphere(new Point3(1.0, 2.0, 2.0), 2.0, Color.LIGHTGREEN, {Ka:0.1, Kd:0.6, Ks:0.3, ior: 3.5, refractive: true}));
    scene.addObject(new Sphere(new Point3(-2.0, 2.0, 3.0), 1.5, Color.DARKYELLOW, {Ka:0.1, Kd:0.6, Ks:0.3, ior: 0.15}));
    scene.addObject(new Sphere(new Point3(2.0, 4.0, 8.0), 4.0, Color.LIGHTRED, {Ka:0.1, Kd:0.6, Ks:0.3, ior: 0.1}));
    scene.addObject(new Sphere(new Point3(-4.0, 4.0, 6.0), 2.0, Color.LIGHTBLUE, {Ka:0.1, Kd:0.9, Ks:0.0, ior: 0.75}));
    scene.addObject(new Sphere(new Point3(0, -1000.0, 0), 1000.0, Color.GRAY, {Ka:0.1, Kd:0.3, Ks:0.1, ior: 0.25}));
    scene.addAreaLight(makeAreaLight(
        new Point3(-6.0, 14.0, -8.0),
        new Vector3(10.0, 0.0, 0.0),
        new Vector3(0.0, 0.0, 10.0),
        Color.WHITE,
        3.0
    ));
    return scene;
}

export function packSceneForWebGPU(scene) {
    // Packing struct:
    // struct Sphere { center: vec3<f32>, radius: f32, materialIdx: u32, _pad: vec3<f32> };
    // size: 3*4 + 4 + 4 + 3*4 = 32 bytes = 8 floats per sphere
    
    // struct Material { color: vec3<f32>, kd: f32, ks: f32, ior: f32, refractive: f32, ka: f32 };
    // size: 3*4 + 4 + 4 + 4 + 4 + 4 = 32 bytes = 8 floats per material

    // struct AreaLight { center: vec3<f32>, intensity: f32, u: vec3<f32>, _pad1: f32, v: vec3<f32>, _pad2: f32, color: vec3<f32>, _pad3: f32 };
    // size: 3*4 + 4 + 3*4 + 4 + 3*4 + 4 + 3*4 + 4 = 64 bytes = 16 floats per light

    var numSpheres = scene.objects.length;
    var numMaterials = numSpheres; // 1-to-1 mapping for simplicity right now
    var numLights = scene.areaLights.length;

    var sphereBuffer = new Float32Array(numSpheres * 8);
    var materialBuffer = new Float32Array(numMaterials * 8);
    var lightBuffer = new Float32Array(Math.max(1, numLights) * 16);

    for (var i = 0; i < numSpheres; i++) {
        var obj = scene.objects[i];
        var baseIdx = i * 8;
        sphereBuffer[baseIdx + 0] = obj.center.x;
        sphereBuffer[baseIdx + 1] = obj.center.y;
        sphereBuffer[baseIdx + 2] = obj.center.z;
        sphereBuffer[baseIdx + 3] = obj.radius;
        sphereBuffer[baseIdx + 4] = i; // materialIdx
        // pad remains 0
    }

    for (var i = 0; i < numSpheres; i++) {
        var mat = scene.objects[i].material;
        var c = scene.objects[i].color;
        var baseIdx = i * 8;
        materialBuffer[baseIdx + 0] = c.r / 255.0;
        materialBuffer[baseIdx + 1] = c.g / 255.0;
        materialBuffer[baseIdx + 2] = c.b / 255.0;
        materialBuffer[baseIdx + 3] = mat.Kd !== undefined ? mat.Kd : 0.6;
        materialBuffer[baseIdx + 4] = mat.Ks !== undefined ? mat.Ks : 0.3;
        materialBuffer[baseIdx + 5] = mat.ior !== undefined ? mat.ior : 1.5;
        materialBuffer[baseIdx + 6] = mat.refractive ? 1.0 : 0.0;
        materialBuffer[baseIdx + 7] = mat.Ka !== undefined ? mat.Ka : 0.1;
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
        materials: materialBuffer,
        lights: lightBuffer,
        numSpheres: numSpheres,
        numLights: numLights
    };
}
