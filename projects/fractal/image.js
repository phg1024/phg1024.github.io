/**
 * Created by peihongguo on 10/5/13.
 */

function Color(r, g, b, a)
{
    if( arguments.length !== 4 )
    {
        this.r = this.g = this.b = this.a = 0;
    }
    else
    {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
}

Color.RED = new Color(255, 0, 0, 255);
Color.GREEN = new Color(0, 255, 0, 255);
Color.BLUE = new Color(0, 0, 255, 255);
Color.YELLOW = new Color(255, 255, 0, 255);
Color.PURPLE = new Color(255, 0, 255, 255);
Color.CYAN = new Color(0, 255, 255, 255);
Color.WHITE = new Color(255, 255, 255, 255);
Color.BLACK = new Color(0, 0, 0, 255);
Color.GRAY = new Color(128, 128, 128, 255);

Color.prototype.setColor = function(that)
{
    if( that != null &&
        that.constructor === Color )
    {
        this.r = that.r;
        this.g = that.g;
        this.b = that.b;
        this.a = that.a;
        return this;
    }
    else
        return null;
};

Color.prototype.add = function(that)
{
    return new Color(this.r + that.r, this.g + that.g, this.b + that.b, this.a + that.a);
};

Color.prototype.mul = function(c)
{
    return new Color(this.r * c, this.g * c, this.b * c, this.a * c);
};

Color.interpolate = function(c1, c2, t)
{
    return c1.mul(t).add(c2.mul(1-t));
};

function RGBAImage( w, h )
{
    this.channels = 4;
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w*h*this.channels);
    this.setPixel = function( x, y, c )
    {
        var idx = (y * this.w + x) * this.channels;
        this.data[idx] = c.r;
        this.data[idx+1] = c.g;
        this.data[idx+2] = c.b;
        this.data[idx+3] = c.a;
    }
}

RGBAImage.prototype.uploadTexture = function( ctx, texId )
{
    var w = this.w;
    var h = this.h;

    ctx.bindTexture(ctx.TEXTURE_2D, texId);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.NEAREST);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.NEAREST);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
    ctx.texImage2D(ctx.TEXTURE_2D, 0,  ctx.RGBA, w, h, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, this.data);
};

RGBAImage.prototype.toImageData = function( ctx )
{
    var imgData = ctx.createImageData(this.w, this.h);
    imgData.data.set(this.data);
    return imgData;
};