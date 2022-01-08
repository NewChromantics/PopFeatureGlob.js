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
	
	function IndexToFeature(Index)
	{
		const Width = OutputImage.GetWidth();
		const Height = OutputImage.GetHeight();
		const x = Index % Width;
		const y = Math.floor( Index / Width );
		const u = x / Width;
		const v = y / Height;
		return [u,v];
	}
	
	let MatchingIndexes = [];
	const Pixels = OutputImage.GetPixelBuffer();
	for ( let p=0;	p<Pixels.length;	p+=4 )
	{
		const Index = p/4;
		const rgba = Pixels.slice( p, p+4 );
		const Alpha = rgba[3];
		if ( Alpha < 200 )
			continue;
		MatchingIndexes.push(Index);
		if ( MatchingIndexes.length > 2000 )
			break;
	}
	
	const Features = MatchingIndexes.map(IndexToFeature);
	return Features;
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
	const HighContrastShader = await RenderContext.CreateShader( GlobAssets.BlitVertShader, GlobAssets.HighContrastFrag );
	const FindFeaturesShader = await RenderContext.CreateShader( GlobAssets.BlitVertShader, GlobAssets.FindFeaturesFrag );
	const ExtractFeaturesShader = await RenderContext.CreateShader( GlobAssets.BlitVertShader, GlobAssets.ExtractFeaturesFrag );

	//	blit chain
	const Shaders = 
	[
		HighContrastShader,
		FindFeaturesShader,
		ExtractFeaturesShader,
	];

	const ImageWidth = Image.GetWidth(); 
	const ImageHeight = Image.GetHeight(); 
	
	const DrawState = {};
	DrawState.CullMode = false;
	DrawState.DepthRead = false;
	DrawState.BlendMode = 'Blit';

	const OutputImageWidth = ImageWidth/1;
	const OutputImageHeight = ImageHeight/1;
	const LastImageWidth = Math.floor(OutputImageWidth / 1);
	const LastImageHeight = Math.floor(OutputImageHeight / 1);

	function MakeOutputImage(Shader)
	{
		const Last = Shader==ExtractFeaturesShader;
		let Width = Last ? LastImageWidth : OutputImageWidth;
		let Height = Last ? LastImageHeight : OutputImageHeight;
	
		const OutputImage = new Pop.Image();
		//	todo: remove the need for dummy pixels
		const DummyPixels = new Uint8Array(Width*Height*4);
		OutputImage.WritePixels( Width, Height, DummyPixels, 'RGBA' );
		return OutputImage;
	}
	
	//	to readback pixels, we need to render to a texture
	const OutputImages = Shaders.map(MakeOutputImage);

	//	make draw commands
	const RenderCommands = [];
	let InputImage = Image;
	for ( let i=0;	i<Shaders.length;	i++ )
	{
		const Shader = Shaders[i];
		const OutputImage = OutputImages[i];
		const ReadBack = (i == Shaders.length-1);
		const Uniforms = {};
		Uniforms.InputTexture = InputImage;
		Uniforms.InputWidthHeight = [InputImage.GetWidth(),InputImage.GetHeight()];
		//InputImage.SetLinearFilter(true);

		RenderCommands.push(['SetRenderTarget',OutputImage,[1,0,0,1],ReadBack]);
		RenderCommands.push(['Draw',Geometry,Shader,Uniforms]);
		InputImage = OutputImage;
	}
	
	const OutputImage = OutputImages[OutputImages.length-1];

	//	render
	await RenderContext.Render(RenderCommands);

	//	image has pixel output
	return OutputImage;
}

