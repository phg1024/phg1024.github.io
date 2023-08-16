/*
 Ray tracer 
*/

function Scene() {
    this.lights = [];
    this.addLight = function( l ) {
        this.lights.push(l);
    };
    this.objects = [];
    this.addObject = function(obj) {
        this.objects.push(obj);
    };
    this.bgColor = Color.BLACK;
	
	this.isLightVisible = function( pos, lidx ) {
		var light = this.lights[lidx];
		
		var v = Vector3.fromPoint3(pos, light.pos);
		var tRef = v.norm();
		var tMin = Number.MAX_VALUE;
		v = v.normalized();
        for(var i=0;i<this.objects.length;i++)
        {
            var t = this.objects[i].intersectT(pos, v);
			
            if( t !== undefined )
            {
                tMin = Math.min(tMin, t);
            }
        }
		
		return (tMin > tRef);
	}

    this.intersect = function( ray, eyepos ) {
        if( ray.depth === 0 )
        {
            return {hit: false, t: Number.MAX_VALUE, p: new Point3(), color: this.bgColor}
        }

        var hit = {t: Number.MAX_VALUE};
        for(var i=0;i<this.objects.length;i++)
        {
            var h = this.objects[i].intersect( ray, this, eyepos );
            if(h.hit && (h.t < hit.t))
            {
                hit = h;
            }
        }

        // blend the hit with recursive hits
        if( hit.hit )
        {
            //console.log(hit);
            var recursiveHit = this.intersect( hit.newRay, eyepos );
            if( recursiveHit.hit )
                hit.color = Color.interpolate(recursiveHit.color, hit.color, hit.fr);
            else
                hit.color = Color.interpolate(this.bgColor, hit.color, hit.fr);
        }
        else
        {
            hit.color = this.bgColor;
        }

        return hit;
    }
}

function Camera(origin, dir, up, f, fovy, w, h) {
    this.origin = origin;
    this.direction = dir.normalized();
    this.up = up.normalized();
    this.f = f;     /* foco length */
    this.fovy = fovy;

    this.canvas = new Canvas(
        origin.add(this.direction.mul(f)),
        up.cross(this.direction),
        up,
        f * Math.atan(fovy / 180.0 * PI ),
        w,
        h
    );

    this.getRays = function(x, y, n, maxDepth) {
		var nx = ny = Math.floor(Math.sqrt(n));
		var h = 1.0 / nx;
		var rays = [];
		for(var yy=0;yy<ny;yy++)
		{
			for(var xx=0;xx<nx;xx++)
			{
				rays.push(this.canvas.getRay(x+h*xx, y+h*yy, this.origin, maxDepth));
			}
		}
        return rays; 
    }
}

function Canvas(center, u, v, scale, w, h) {
    this.center = center;
    this.width =  w;//document.getElementById('width').value;
    this.height = h;//document.getElementById('height').value;
    this.u = u;
    this.v = v;
    this.scale = scale;
    this.aspectRatio = this.width/this.height;

    this.getPoint = function(x, y) {
        var dx = (x/this.width - 0.5) * this.scale;
        var dy = (y/this.height - 0.5) * this.scale;
        return this.center.add(this.u.mul(dx).mul(this.aspectRatio))
            .add(this.v.mul(dy));
    }
    this.getRay = function(x, y, origin, maxDepth)
    {
        var p = this.getPoint(x, y);
        return {
            v: Vector3.fromPoint3(origin, p).normalized(),
            p: origin,
            depth: maxDepth
        };
    }
}

function phongShading( obj, epos, pos, normal, scene )
{
    var shadeSum = new Color();
    var intSum = 0;

	var lights = scene.lights;
    var Ka = obj.material.Ka;
    var Kd = obj.material.Kd;
    var Ks = obj.material.Ks;
    for( var i=0;i<lights.length;i++ )
    {
		// test if this light is visible from the point
		var visible = scene.isLightVisible(pos, i);
		
		if( visible )
		{
			var V = Vector3.fromPoint3(pos, epos).normalized();
			var L = Vector3.fromPoint3(pos, lights[i].pos);
			var factor = 1.0 / L.normSquared();
			L = L.normalized();
			var N = normal.normalized();
			var LdotN = L.dot(N);
			var R = N.mul(LdotN).mul(2.0).sub(L);

			var diff = Math.max(0, LdotN);
			var spec = Math.pow(Math.max(0, R.dot(V)), lights[i].specFactor);

			var shade = lights[i].ambient.mul(Ka)
			.add(lights[i].diffuse.mul(diff).mul(Kd))
			.add(lights[i].specular.mul(spec).mul(Ks));
			
			shadeSum = shadeSum.add(shade.mul(lights[i].intensity));//.mul(factor));
			intSum += lights[i].intensity;
		}
		else
		{
	        var shade = lights[i].ambient.mul(Ka);
			
	        shadeSum = shadeSum.add(shade.mul(lights[i].intensity));//.mul(factor));
	        intSum += lights[i].intensity;
		}
    }

    shadeSum.mul(1.0 / intSum);

    // add the shading to the object's color
    var color = obj.color.add(shadeSum);
    color.r = clamp(color.r, 0, 255);
    color.g = clamp(color.g, 0, 255);
    color.b = clamp(color.b, 0, 255);
    color.a = clamp(color.a, 0, 255);

    return color;
}