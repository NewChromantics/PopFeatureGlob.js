//	gr: as a module/repository, this should submodule popengine (+fixed on working version)
//		as integration in project... probably shouldn't duplicate popengine
//		figure out this later if it's ever used outside the holosports editor
//	for native (with PopEngine), irrelevent!
import Pop from '../PopEngine/PopEngine.js'
import {GetLineLineIntersection,Distance2} from '../PopEngine/Math.js'

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
	const OutputImage = await GetFeaturesImage(Image,RenderContext,true);
	
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
		if ( Alpha < 10 )
			continue;
		MatchingIndexes.push(Index);
		if ( MatchingIndexes.length > 2000 )
			break;
	}
	
	const Features = MatchingIndexes.map(IndexToFeature);
	return Features;
}



async function FilterImage(Image,RenderContext=null,FragShaderSources)
{
	if ( !RenderContext )
	{
		Pop.Warning(`No rendercontext, creating & discarding rendercontext just for this run`);
		RenderContext = new Pop.Opengl.Context(null);
	}
	FragShaderSources = FragShaderSources || [];
	if ( !FragShaderSources.length )
		throw `No frag shaders provided`;
	
	//	create blit geo
	const GeometryData = GlobAssets.BlitGeometry;
	const Geometry = await RenderContext.CreateGeometry(GeometryData);
	
	//	create shaders
	const Shaders = [];
	for ( let FragSource of FragShaderSources )
	{
		const Shader = await RenderContext.CreateShader( GlobAssets.BlitVertShader, FragSource );
		Shaders.push(Shader);
	}

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

	function MakeOutputImage(Shader,ShaderIndex)
	{
		const Last = ShaderIndex == (Shaders.length-1);
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



export async function GetFeaturesImage(Image,RenderContext=null,ExtractFeaturesPass=false)
{
	const FragShaders = 
	[
	GlobAssets.HighContrastFrag,
	GlobAssets.DilateFrag,
	GlobAssets.FindFeaturesFrag,
	ExtractFeaturesPass ? GlobAssets.ExtractFeaturesFrag : null,
	].filter( s => s!=null );

	return FilterImage( Image, RenderContext, FragShaders );
}


export async function GetLineSegmentImage(Image,RenderContext=null)
{
	const FragShaders = 
	[
	GlobAssets.HighContrastFrag,
	GlobAssets.DilateFrag,
	];

	return FilterImage( Image, RenderContext, FragShaders );
}

export async function GetLineSegments(Image,RenderContext=null)
{
	Image = await GetLineSegmentImage(Image,RenderContext);
	const ImageWidth = Image.GetWidth();
	const ImageHeight = Image.GetHeight();

/*
	const LineSegments = 
	[
		[	[0.1,0.5],	[0.9,0.5]	],
		[	[0.5,0.1],	[0.5,0.9]	],
	];
	*/
	//	do hough accumulation
	//	first implementation via 
	//	https://github.com/gmarty/hough-transform-js/blob/master/hough-transform.js
	
	//	not windowed
	var AngleCount = 180;
	let drawingWidth = 100;
	let drawingHeight = 100;
	var rhoMax = Math.sqrt(drawingWidth * drawingWidth + drawingHeight * drawingHeight);
	const CellSize = [30,30];
	const CellCount = CellSize[0] * CellSize[1];
	var accum = new Array(AngleCount);
	
	function GetCellXy(x,y)
	{
		const cx = Math.floor( x / ImageWidth * CellSize[0]);
		const cy = Math.floor( y / ImageHeight * CellSize[1]);
		return [cx,cy];
	}
	function GetCellIndex(x,y)
	{
		const cxy = GetCellXy(x,y);
		const Index = cxy[0] + (cxy[1] * CellSize[0]);
		return Index;
	}
	function GetCellRect(Index)
	{
		const cx = Index % CellSize[0];
		const cy = Math.floor( Index / CellSize[0] );
		let Left = cx / CellSize[0];
		let Right = (cx+1) / CellSize[0];
		let Top = cy / CellSize[1];
		let Bottom = (cy+1) / CellSize[1];
		const Rect = {};
		Rect.Left = Math.floor(Left * ImageWidth);
		Rect.Right = Math.floor(Right * ImageWidth);
		Rect.Top = Math.floor(Top * ImageHeight);
		Rect.Bottom = Math.floor(Bottom * ImageHeight);
		return Rect;
	}
	
	var cosTable = Array(AngleCount);
	var sinTable = Array(AngleCount);
	for ( let AngleIndex=0;	AngleIndex<AngleCount;	AngleIndex++ )
	{
		let Theta = (AngleIndex/AngleCount) * (Math.PI);
		cosTable[AngleIndex] = Math.cos(Theta);
		sinTable[AngleIndex] = Math.sin(Theta);
	}

	
	const LineSegments = [];
	function OnLine(Start,End)
	{
		Start[0] /= ImageWidth;
		End[0] /= ImageWidth;
		Start[1] /= ImageHeight;
		End[1] /= ImageHeight;
		LineSegments.push( [Start,End] );
	}
	
	function findMaxInHough() 
	{
		//	this needs to work out the max for that row's length in a window
		//	otherwise we wont hit corners
		let MinAccumulation = 30;
		let MaxAccumulation = 0;
		
		
		function OnHoughHit(Rho,AngleIndex,HitCount,CellIndex)
		{
			// now to backproject into drawing space
			Rho<<=1; // accumulator is bitshifted
			Rho-=rhoMax; /// accumulator has rhoMax added
			//console.log(Theta,Rho,HitCount);
			var a = cosTable[AngleIndex];
			var b = sinTable[AngleIndex];
			
			let LineWidth = 1000;
			
			var x1=a*Rho+LineWidth*(-b);
			var y1=(b*Rho+LineWidth*(a));
			var x2=a*Rho-LineWidth*(-b);
			var y2=(b*Rho-LineWidth*(a));
			x1 += drawingWidth/2;
			x2 += drawingWidth/2;
			y1 += drawingHeight/2;
			y2 += drawingHeight/2;
			let Start = [x1,y1];
			let End = [x2,y2];
			
				
			const Rect = GetCellRect(CellIndex);
			const TopLeft = [Rect.Left,Rect.Top];
			const TopRight = [Rect.Right,Rect.Top];
			const BottomRight = [Rect.Right,Rect.Bottom];
			const BottomLeft = [Rect.Left,Rect.Bottom];
				
			let ImageEdges = 
			[
				[	TopLeft,		TopRight	],
				[	TopRight,		BottomRight	],
				[	BottomRight,	BottomLeft	],
				[	BottomLeft,		TopLeft	],
			];
			
			
			let EdgeIntersections = ImageEdges.map( Edge => GetLineLineIntersection( Edge[0], Edge[1], Start, End ) );
			EdgeIntersections = EdgeIntersections.filter( Intersection => Intersection!=false );
			
			if ( EdgeIntersections.length != 2 )
				return;
			OnLine( EdgeIntersections[0], EdgeIntersections[1] );

			//OnLine( Start, End );
		}
		
		for (let AngleIndex=0;AngleIndex<AngleCount;AngleIndex++) 
		{
			for (let rho=0;	rho<accum[AngleIndex].length;	rho++) 
			{
				if ( !accum[AngleIndex][rho] )
					continue;
				if ( LineSegments.length > 3000 )
				{
					console.warn(`Too many hits`);
					break;
				}
				for ( let CellIndex=0;	CellIndex<CellCount;	CellIndex++ )
				{
					let HitCount = accum[AngleIndex][rho][CellIndex];
					MaxAccumulation = Math.max( MaxAccumulation, HitCount||0 );
					if (HitCount>MinAccumulation) 
					{
						OnHoughHit( rho, AngleIndex, HitCount, CellIndex );
					}
				}
			}
		}
		
		console.log(`Max accumulation is ${MaxAccumulation}`);
		

	}

	
	
	// Classical implementation.
	function houghAccClassical(x, y) 
	{
		let Pos = [x,y];
		var rho;
		x -= drawingWidth / 2;
		y -= drawingHeight / 2;
		for ( let thetaIndex=0;	thetaIndex<AngleCount;	thetaIndex++ ) 
		{
			//let Theta = (thetaIndex/AngleCount) * (Math.PI);
			//rho = rhoMax + x * Math.cos(Theta) + y * Math.sin(Theta);
			rho = rhoMax + x * cosTable[thetaIndex] + y * sinTable[thetaIndex];
			rho >>= 1;
			
			const CellIndex = GetCellIndex( Pos[0], Pos[1] );
			accum[thetaIndex] = accum[thetaIndex] || [];
			accum[thetaIndex][rho] = accum[thetaIndex][rho] || [];
			accum[thetaIndex][rho][CellIndex] = accum[thetaIndex][rho][CellIndex] || 0;
			accum[thetaIndex][rho][CellIndex]++;
		}
	}
	
	function OnPixel(x,y)
	{
		houghAccClassical(x,y);
	}
	
	
	const Pixels = Image.GetPixelBuffer();
	for ( let p=0;	p<Pixels.length;	p+=4 )
	{
		const Index = p/4;
		const rgba = Pixels.slice( p, p+4 );
		const Alpha = rgba[0];
		if ( Alpha < 10 )
			continue;
		const x = Index % ImageWidth;
		const y = Math.floor( Index / ImageWidth );
		OnPixel(x,y);
	}
	findMaxInHough();
	

	
	return LineSegments;
}
