/**
 * Created by peihongguo on 10/14/13.
 */

function intersectTriangle( p, dir, v1, v2, v3 ) {
    var t;

    return t;
}

function Mesh( filename, color, material ) {
    var that = new Shape();
    that.color = color;
    that.material = material;

    that.intersect = function( ray, scene, eyepos ) {
        // find the closest hit
        var t;
        for(var i=0;i<this.faces.length;i++) {
            var f = this.faces[i];
            var v1 = this.verts[f[0].v];
            var v2 = this.verts[f[1].v];
            var v3 = this.verts[f[2].v];
            var tcur = intersectTriangle(
                ray.p, ray.v,
                v1, v2, v3
            );

            if( tcur && tcur < t ) {
                t = tcur;
            }
        }


        if( t === undefined )
        {
            // no hit
            return {
                hit: false, t: Number.MAX_VALUE,
                p: new Point3(), color: new Color()
            };
        }
        else
        {
            // hit at t
            var hitPos = ray.p.add(ray.v.mul(t));
            var n = Vector3.fromPoint3(this.center, hitPos).normalized();
            var rv = ray.v.sub(n.mul(ray.v.dot(n)).mul(2)).normalized();

            // add lighting
            var c = phongShading( this, eyepos, hitPos, n, scene );

            return {
                hit: true, t: t,
                p: hitPos, color: c,
                newRay : {v:rv, p: hitPos, depth: ray.depth - 1},
                fr: this.material.fr
            };
        }
    };

    // fetch the file
    var xhr = new XMLHttpRequest();
    xhr.open('GET', './'+filename, true);
    xhr.responseType = 'text';

    xhr.onload = function(e) {
        parseMesh(that, this.response);
    };

    xhr.send();

    // parse the mesh file to create the mesh
    function parseMesh( mesh, str ) {
        console.log('parsing mesh file...');
        mesh.verts = [];
        mesh.faces = [];
        mesh.normals = [];
        var lines = str.split('\n');
        for(var i=0;i<lines.length;i++)
        {
            var line = lines[i];
            // parse the line
            var parts = line.split(/\s+/);
            var tokenType = parts[0];
            switch( tokenType ) {
                case 'v':
                {
                    // a vertex
                    var x = parseFloat(parts[1]);
                    var y = parseFloat(parts[2]);
                    var z = parseFloat(parts[3]);
                    mesh.verts.push(new Point3(x, y, z));
                    break;
                }
                case 'f':
                {
                    // a face, only supports triangle faces
                    var f = [];
                    for(var j=1;j<4;j++) {
                        var fparts = parts[j].split('/');
                        f.push({
                            v: fparts[0],
                            t: fparts[1],
                            n: fparts[2]
                        });
                    }
                    mesh.faces.push(f);
                    break;
                }
                case 'vn':
                {
                    // a vertex normal
                    var x = parseFloat(parts[1]);
                    var y = parseFloat(parts[2]);
                    var z = parseFloat(parts[3]);
                    mesh.normals.push(new Vector3(x, y, z));
                    break;
                }
                case 'vt':
                {
                    // texture coords
                    break;
                }
                case 'vp':
                {
                    // parametric space coords
                    break;
                }
                case '#':
                    // comment line
                default:
                {
                    // just ignore this line
                    break;
                }

            }
        }
    }

    return that;
}