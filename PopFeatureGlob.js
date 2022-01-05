//	gr: as a module/repository, this should submodule popengine (+fixed on working version)
//		as integration in project... probably shouldn't duplicate popengine
//		figure out this later if it's ever used outside the holosports editor
//	for native (with PopEngine), irrelevent!
import Pop from '../PopEngine/PopEngine.js'

//	geo, shaders etc
import * as GlobAssets from './GlobAssets.js'


export class GlobFeature_t
{
	constructor(u,v,Descriptor)
	{
		this.u = u;
		this.v = v;
		this.Descriptor = Descriptor;
	}
}


//	returns array of GlobFeature_t
export async function GetFeatures(Image,RenderContext=null)
{
	const OutputImage = await GetFeaturesImage(Image,RenderContext);
	throw `todo: extract features`;
}

export async function GetFeaturesImage(Image,RenderContext=null)
{
	if ( !RenderContext )
	{
		Pop.Warning(`No rendercontext, creating & discarding rendercontext just for this run`);
		RenderContext = new Pop.Opengl.Context(null);
	}
	
	//	create blit geo
	const GeometryData = GlobAssets.BlitGeometry;
	const Geometry = await RenderContext.CreateGeometry(GeometryData);
	
	//	create shader
	const Shader = await RenderContext.CreateShader( GlobAssets.BlitVertShader, GlobAssets.FindFeaturesFrag );

	const ImageWidth = Image.GetWidth(); 
	const ImageHeight = Image.GetHeight(); 
	const Uniforms = {};
	Uniforms.InputTexture = Image;
	Uniforms.InputWidthHeight = [ImageWidth,ImageHeight];
	
	const DrawState = {};
	DrawState.CullMode = false;
	DrawState.DepthRead = false;
	DrawState.BlendMode = 'Blit';
	
	//	to readback pixels, we need to render to a texture
	const OutputImage = new Pop.Image();
	//	todo: remove the need for dummy pixels
	const DummyPixels = new Uint8Array(ImageWidth*ImageHeight*4);
	OutputImage.WritePixels( ImageWidth, ImageHeight, DummyPixels, 'RGBA' );

	//	make draw commands
	const ReadBack = true;
	const RenderCommands = [];
	RenderCommands.push(['SetRenderTarget',OutputImage,[1,0,0,1],ReadBack]);
	RenderCommands.push(['Draw',Geometry,Shader,Uniforms]);

	//	render
	await RenderContext.Render(RenderCommands);

	//	image has pixel output
	return OutputImage;
}

