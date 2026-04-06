/**
 * Created by Peihong Guo on 10/11/13.
 */
importScripts('raytracer.js', 'image.js', 'point.js', 'vector.js', 'utils.js', 'shape.js', 'mesh.js');


var rayTracingInfo;
self.addEventListener('message', function(e) {
    var data = e.data;
    switch (data.cmd) {
        case 'start':
            rayTracingInfo = {
                w: data.w,
                h: data.h,
                x1: data.x1,
                x2: data.x2,
                y1: data.y1,
                y2: data.y2,
                nsamples : data.nsamples,
                maxDepth : data.maxDepth,
                tidx: data.tidx
            }

            //self.postMessage({w: data.w, h:data.h, nsamples:data.nsamples, maxDepth:data.maxDepth});

            run();

            self.postMessage({msg:'done'});
            break;
        default:
            self.postMessage('Unknown command: ' + data);
    };
}, false);


function run()
{
    // construct scene
    var scene = new Scene();
    scene.addObject(new Sphere(new Point3(1.0, 2.0, 2.0), 2.0, Color.LIGHTGREEN, {Ka:0.1, Kd:0.6, Ks:0.3, ior: 3.5, refractive: true}));
    scene.addObject(new Sphere(new Point3(-2.0, 2.0, 3.0), 1.5, Color.DARKYELLOW, {Ka:0.1, Kd:0.6, Ks:0.3, ior: 0.15}));
    scene.addObject(new Sphere(new Point3(2.0, 4.0, 8.0), 4.0, Color.LIGHTRED, {Ka:0.1, Kd:0.6, Ks:0.3, ior: 0.1}));
    scene.addObject(new Sphere(new Point3(-4.0, 4.0, 6.0), 2.0, Color.LIGHTBLUE, {Ka:0.1, Kd:0.6, Ks:0.3, ior: 0.75}));
    scene.addObject(new Sphere(new Point3(0, -1e6, 0), 1e6, Color.GRAY, {Ka:0.1, Kd:0.3, Ks:0.1, ior: 0.25}));

    //scene.addObject(new Mesh('cube.obj'));

    scene.addLight( {
            pos: new Point3(-40.0, 80.0, -40.0),
            radius: 20.0,
            ambient: new Color(10, 10, 10, 255),
            diffuse: Color.WHITE,
            specular: Color.WHITE,
            specFactor: 40.0,
            intensity: 1.0}
    );

    // setup camera
    var cam = new Camera(
        new Point3(0, 7.0, -36.0),   // origin
        new Vector3(0, -0.1, 1),              // dir
        new Vector3(0, 1, 0),       // up,
        6.0,                        // f,
        22.5,                       // fovy
        rayTracingInfo.w,
        rayTracingInfo.h
    );

    var x1 = rayTracingInfo.x1;
    var x2 = rayTracingInfo.x2;
    var y1 = rayTracingInfo.y1;
    var y2 = rayTracingInfo.y2;

    var w = x2 - x1;
    var h = y2 - y1;

    var img = new RGBAImage(w, h);

    var nsamples = rayTracingInfo.nsamples;
    var maxDepth = rayTracingInfo.maxDepth;
    var progress = 0;
    var progressStep = 1.0 / h;
    for(var i=y1;i<y2;i++)
    {
        for(var j=x1;j<x2;j++)
        {
            var rays = cam.getRays(j, i, nsamples, maxDepth);
            var pixel = new Color(0, 0, 0, 0);
            for(var k=0;k<rays.length;k++)
            {
                var hit = scene.intersect(rays[k], cam.origin);
                pixel = pixel.add(hit.color);
            }
            img.setPixel(j-x1, y2-1-i, pixel.mul(1.0/nsamples));
        }
        progress += progressStep;
        //self.postMessage({msg: 'progress', tidx: rayTracingInfo.tidx, value: (progress * 100)});
    }

    // post the image data to the main thread
    self.postMessage({msg:'image', x1:x1, x2:x2, y1: y1, y2: y2, value:img.data.buffer}, [img.data.buffer]);
}