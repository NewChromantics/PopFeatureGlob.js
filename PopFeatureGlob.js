//	gr: as a module/repository, this should submodule popengine (+fixed on working version)
//		as integration in project... probably shouldn't duplicate popengine
//		figure out this later if it's ever used outside the holosports editor
//	for native (with PopEngine), irrelevent!
import Pop from '../PopEngine/PopEngine.js'
import {GetLineDistanceToLine,GetLineLineIntersection,Distance2,Length2,Lerp} from '../PopEngine/Math.js'

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

	const Pixels = Image.GetPixelBuffer();
	function GetPixelScoreFromIndex(Index)
	{
		const p = Index * 4;
		const rgba = Pixels.slice( p, p+4 );
		const Alpha = rgba[0];
		return Alpha/255;
	}

	function GetPixelScore(x,y)
	{
		if ( x < 0 || y < 0 || x>=ImageWidth || y>=ImageHeight)
			return 0;
		const Index = x + (y*ImageWidth);
		return GetPixelScoreFromIndex(Index); 
	}


	//	do hough accumulation
	//	first implementation via 
	//	https://github.com/gmarty/hough-transform-js/blob/master/hough-transform.js
	
	//	gr: angles get way more innaccurate the further from the cell center they are
	const AngleCount = 90;	//	360 does give more accurate lines
	const NeighbourSearch_AngleDegreeRange = 0;
	const NeighbourSearch_AngleRadius = Math.max( 1, Math.floor(NeighbourSearch_AngleDegreeRange * (AngleCount/360) ) );
	const NeighbourSearch_RhoRadius = 0;

	const SkipDuplicates = true;
	const ClipToLineMinMax = true;
	const SnapEndPointsToExistingLine = true;
	
	//	artificially makes lines a bit longer. but also decreases density
	//	helps where min/max of cell becomes fuzzy regarding xy search
	const PadClippingBox = 1;	
	const DontDuplicateHigherDensity = false;
	const MergeLineDistance = 7;	//	smaller lines within this distance are culled
	const MergeEndPointMaxDistance = 3;
	const SkipIfSameNeighbours = false;	//	for debugging, we'll lose lines!
	const LineDensityUseScore = true;	//	false better on small images...
	const NeighbourCompareDensity = false;	//	else score
	const LineDensityMin = 0.90;
	const MinPixelScore = 4;	//	this is now scored so scales
	const MinPixelHits = 4;
	const SnapToImagePreDuplicate = true;
	const SnapToImagePixelRadius = 5;
	//const CellsWide = 26;//Math.floor( (1/640) * ImageWidth );
	//const CellsHigh = 18;//Math.floor( (1/480) * ImageHeight );
	
		
	function GetCellXy(x,y,CellDim)
	{
		const cx = Math.floor( x / ImageWidth * CellDim[0]);
		const cy = Math.floor( y / ImageHeight * CellDim[1]);
		return [cx,cy];
	}
	function GetCellIndex(x,y,CellDim)
	{
		const cxy = GetCellXy(x,y,CellDim);
		const Index = cxy[0] + (cxy[1] * CellDim[0]);
		return Index;
	}
	function GetCellRect(Index,CellDim)
	{
		const cx = Index % CellDim[0];
		const cy = Math.floor( Index / CellDim[0] );
		let Left = cx / CellDim[0];
		let Right = (cx+1) / CellDim[0];
		let Top = cy / CellDim[1];
		let Bottom = (cy+1) / CellDim[1];
		const Rect = {};
		Rect.Left = Math.floor(Left * ImageWidth);
		Rect.Right = Math.floor(Right * ImageWidth);
		Rect.Top = Math.floor(Top * ImageHeight);
		Rect.Bottom = Math.floor(Bottom * ImageHeight);
		Rect.MiddleX = Math.floor( Lerp(Left,Right,0.5) * ImageWidth );
		Rect.MiddleY = Math.floor( Lerp(Top,Bottom,0.5) * ImageHeight );
		return Rect;
	}
	

	function SnapToHigherScore(origx,origy)
	{
		//	gr: hmm should this go along the line, or radius fine?
		let SearchRad = SnapToImagePixelRadius;
		let BestPos = [origx,origy];
		let Best = GetPixelScore(...BestPos);
		let BestDistance = 0;
		
		if ( Best == 0 )
		{
			//console.log(`Got best of zero for a line endpoint?`);
		}
		
		//	avoid snapping up-left by starting from center and move outward
		for ( let rad=1;	rad<=SearchRad;	rad++ )
		{
			if ( Best >= 1.0 )
				break;
			function Try(x,y)
			{
				const Score = GetPixelScore(origx+x,origy+y);
				if ( Score < Best )
					return;
				let Distance = Length2([x,y]);
				//	if same score, pick distance
				if ( Score == Best )
				{
					if ( Distance >= BestDistance )
						return;
				}
				BestDistance = Distance;
				Best = Score;
				BestPos = [origx+x,origy+y];
			}
			
			//	top row
			for ( let x=-rad;	x<=rad;	x++ )
				Try( x, -rad );

			//	bottom row
			for ( let x=-rad;	x<=rad;	x++ )
				Try( x, rad );
				
			//	left
			for ( let y=-rad+1;	y<=rad-1;	y++ )
				Try( -rad, y );
				
			//	right
			for ( let y=-rad+1;	y<=rad-1;	y++ )
				Try( rad, y );
		}
		return BestPos;
	}
	
	let DuplicateButDenserIgnored = 0;
	let DuplicatesSkipped = 0;
	let NeighboursSkipped = 0;
	let SameNeighboursSkipped = 0;
	let StartsSnapped = 0;
	let EndsSnapped = 0;
	let LineSegments = [];
	let NewLines = [];
	
	function OnNewLine(NewLine)
	{
		NewLines.push(NewLine);
	}
	
	function SnapLineToImage(Line)
	{
		if ( !SnapToImagePreDuplicate )
			return;
			
		const Start = SnapToHigherScore( ...Line.Start );
		const End = SnapToHigherScore( ...Line.End );
		Line.Start[0] = Start[0];
		Line.Start[1] = Start[1];
		Line.End[0] = End[0];
		Line.End[1] = End[1];
		
		//	recalc some stuff
		//	gr: dont recalc density?
		Line.LengthPx = Distance2( Line.Start, Line.End );
	}
	
	function AddLine(NewLine)
	{
		function TooCloseToLine(Line)
		{
			const LineDistance = GetLineDistanceToLine( [NewLine.Start,NewLine.End], [Line.Start,Line.End] );
			if ( LineDistance <= MergeLineDistance )
			{
				if ( DontDuplicateHigherDensity && NewLine.Density > Line.Density )
				{
					DuplicateButDenserIgnored++;
				}
				else
				{
					return true;
				}
			}
				
			return false;
		}
		
		if ( SkipDuplicates )
		{
			if ( LineSegments.some( TooCloseToLine ) )
			{
				DuplicatesSkipped++;
				return true;
			}
		}
		
		function GetNearStart(Line,LineIndex)
		{
			const Meta = {};
			Meta.LineIndex = LineIndex;
			Meta.StartDistance = Distance2(NewLine.Start,Line.Start);
			Meta.EndDistance = Distance2(NewLine.Start,Line.End);
			if ( Meta.StartDistance <= Meta.EndDistance )
				Meta.Nearest = Line.Start;
			else
				Meta.Nearest = Line.End;
			Meta.AnyDistance = Math.min( Meta.StartDistance, Meta.EndDistance );
			if ( Meta.AnyDistance > MergeEndPointMaxDistance )
				return null;
			return Meta;
		}

		function GetNearEnd(Line,LineIndex)
		{
			const Meta = {};
			Meta.LineIndex = LineIndex;
			Meta.StartDistance = Distance2(NewLine.End,Line.Start);
			Meta.EndDistance = Distance2(NewLine.End,Line.End);
			if ( Meta.StartDistance <= Meta.EndDistance )
				Meta.Nearest = Line.Start;
			else
				Meta.Nearest = Line.End;
			Meta.AnyDistance = Math.min( Meta.StartDistance, Meta.EndDistance );
			if ( Meta.AnyDistance > MergeEndPointMaxDistance )
				return null;
			return Meta;
		}
		
		function CompareAnyDistance(a,b)
		{
			if ( a.AnyDistance < b.AnyDistance )	return -1; 
			if ( a.AnyDistance > b.AnyDistance )	return 1; 
			return 0;
		}
		
		if ( SnapEndPointsToExistingLine )
		{
			const NearestStart = LineSegments.map(GetNearStart).filter( m=>m!=null ).sort(CompareAnyDistance)[0];
			if ( NearestStart && NearestStart.Nearest )
			{
				NewLine.Start = NearestStart.Nearest.slice();
				StartsSnapped++;
			}
			
			const NearestEnd = LineSegments.map(GetNearEnd).filter( m=>m!=null ).sort(CompareAnyDistance)[0];
			if ( NearestEnd && NearestEnd.Nearest )
			{
				NewLine.End = NearestEnd.Nearest.slice();
				EndsSnapped++;
			}
		}
		
		LineSegments.push(NewLine);
	}
	
	function GetLine(Hit,CellRect,AngleIndex,Rho)
	{
		if ( Hit.Line )
			return Hit.Line;
			
		const HitRect = Hit.GetRect();
		//	skip 1 pixel lines
		if ( HitRect.Width == 0 || HitRect.Height == 0 )
			return null;
		let Rect = Object.assign({},HitRect);
		Rect.Left -= PadClippingBox;
		Rect.Right += PadClippingBox;
		Rect.Top -= PadClippingBox;
		Rect.Bottom += PadClippingBox;
		
		const TopLeft = [Rect.Left,Rect.Top];
		const TopRight = [Rect.Right,Rect.Top];
		const BottomRight = [Rect.Right,Rect.Bottom];
		const BottomLeft = [Rect.Left,Rect.Bottom];

		let Theta = (AngleIndex/AngleCount) * (Math.PI);
		const a = Math.cos(Theta);
		const b = Math.sin(Theta);
			
		let LineWidth = 1000;
			
		let x1 = a*Rho + LineWidth * (-b);
		let y1 = b*Rho + LineWidth * (a);
		let x2 = a*Rho - LineWidth * (-b);
		let y2 = b*Rho - LineWidth * (a);
		x1 += CellRect.MiddleX;
		x2 += CellRect.MiddleX;
		y1 += CellRect.MiddleY;
		y2 += CellRect.MiddleY;
		let Start = [x1,y1];
		let End = [x2,y2];

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
			return null;
		
		const Line = Object.assign( {}, Hit );
		Line.Start = EdgeIntersections[0];
		Line.End = EdgeIntersections[1];
	
		Line.Start = Line.Start.map( Math.floor );
		Line.End = Line.End.map( Math.floor );
	
		//	due to the way we clip, we could have a line with low hit count, and a long length (a few pixels from one line and a few from another)
		//	we can filter these out where density (hitcount) vs length is very low
		//	note: hit count is a score, so
		Line.LengthPx = Distance2( Line.Start, Line.End );
		Line.Density = (LineDensityUseScore ? Hit.Score : Hit.HitCount) / Line.LengthPx;
		
		//	cache
		Hit.Line = Line;
		return Line;
	}
	
	function ExtractHoughLines(CellAngleRhoHits,CellDim) 
	{
		const CellCount = CellAngleRhoHits.length;
		for ( let CellIndex=0;	CellIndex<CellCount;	CellIndex++ )
		{
			const AngleRhoHits = CellAngleRhoHits[CellIndex];
			if ( !AngleRhoHits )
				continue;
				
			const CellRect = GetCellRect(CellIndex,CellDim);
			FindLinesInCell( CellRect, AngleRhoHits );
		}
		
		function ExtractLine(CellRect,AngleIndex,Rho,AngleRhoHits)
		{
			let Hit = AngleRhoHits[AngleIndex][Rho];
			if ( !Hit )
				return;
					
			if ( Hit.Score < MinPixelScore )
				return;
			if ( Hit.HitCount < MinPixelHits )
				return;

			//	see if there's a better scoring neighbour
			let AngleRadius = NeighbourSearch_AngleRadius;
			let RhoRadius = NeighbourSearch_RhoRadius;
			let BetterNeighbourCount = 0;
			let SameNeighbourCount = 0;
			
			const HitLine = GetLine( Hit, CellRect, AngleIndex, Rho );
			if ( !HitLine )
				return;
				
			if ( HitLine.Density < LineDensityMin )
				return;
			
			//	return -1 if neighbour better
			function CompareNeighbour(NeighbourHit,NeighbourAngleIndex,NeighbourRho)
			{
				if ( NeighbourCompareDensity )
				{
					const NeighbourLine = GetLine( NeighbourHit, CellRect, NeighbourAngleIndex, NeighbourRho );
					if ( !NeighbourLine )
						return -1;
					
					let NeighbourDensity = NeighbourLine.Density;
					if ( NeighbourDensity > Hit.Density )
						return -1;
					if ( NeighbourDensity < Hit.Density )
						return 1;
					return 0;
				}
				else
				{
					let NeighbourScore = NeighbourHit.Score;
					if ( NeighbourScore > Hit.Score )
						return -1;
					if ( NeighbourScore < Hit.Score )
						return 1;
						
					const NeighbourLine = GetLine( NeighbourHit, CellRect, NeighbourAngleIndex, NeighbourRho );
					if ( !NeighbourLine )
						return -1;
					let NeighbourDensity = NeighbourLine.Density;
					if ( NeighbourDensity > HitLine.Density )
						return -1;
					if ( NeighbourDensity < HitLine.Density )
						return 1;
					return 0;
				}
			}
			
			for ( let ar=-AngleRadius;	ar<=AngleRadius;	ar++ )
			{
				//	break early for speed
				if ( BetterNeighbourCount > 0 )
					break;
				
				for ( let nr=Rho-RhoRadius;	nr<=Rho+RhoRadius;	nr++ )
				{
					if ( nr==Rho || ar==0 )
						continue;
					let na = AngleIndex + ar;
					if ( na >= AngleCount )	na -= AngleCount;
					if ( na < 0 )			na += AngleCount;
					if ( !AngleRhoHits[na] )
						continue;
					if ( !AngleRhoHits[na][nr] )
						continue;
						
					const Compare = CompareNeighbour( AngleRhoHits[na][nr], na, nr );
					if ( Compare < 0 )
						BetterNeighbourCount++;
					if ( Compare == 0 )
						SameNeighbourCount++;
				}
			}
			
			if ( BetterNeighbourCount > 0 )
			{
				NeighboursSkipped++;
				return;
			}
			
			if ( SameNeighbourCount > 0 )
			{
				//console.log(`SameNeighbourCount=${SameNeighbourCount}`);
				if ( SkipIfSameNeighbours )
				{
					SameNeighboursSkipped++;
					return;
				}
			}
			
			return HitLine;
		}
		
		function FindLinesInCell(CellRect,AngleRhoHits)
		{
			for (let AngleIndex=0;	AngleIndex<AngleCount;	AngleIndex++ ) 
			{
				const RhoHits = AngleRhoHits[AngleIndex];
				if ( !RhoHits )
					continue;

				if ( LineSegments.length > 9000 )
				{
					console.warn(`Too many hits`);
					break;
				}
					
				for ( let rhokey in RhoHits ) 
				{
					let Rho = Number(rhokey);
					let HitLine = ExtractLine( CellRect, AngleIndex, Rho, AngleRhoHits );
					if ( HitLine )
						OnNewLine(HitLine);
					
				}
			}
		}
		
		function CompareLineLengths(a,b)
		{
			if ( a.LengthPx > b.LengthPx )	return -1;
			if ( a.LengthPx < b.LengthPx )	return 1;
			return 0;
		}
		
		//	sort lines bigger to smaller so overlapped 
		//	lines are more likely to get culled
		NewLines.forEach( SnapLineToImage );
		NewLines = NewLines.sort( CompareLineLengths );
		NewLines.forEach( AddLine );
		
		
		console.log(`skipped neighbour lines x${NeighboursSkipped}`);
		console.log(`skipped same neighbour lines x${SameNeighboursSkipped}`);
		console.log(`skipped duplicate lines x${DuplicatesSkipped}`);
		console.log(`DuplicateButDenserIgnored x${DuplicateButDenserIgnored}`);
		console.log(`snapped starts x${StartsSnapped}`);
		console.log(`snapped ends x${EndsSnapped}`);
		console.log(`Lines found ${LineSegments.length}`);
	}

	let LargestHitCount = 0;
	let HitsAllocated = 0;
	
	class Hit_t
	{
		constructor()
		{
			HitsAllocated++;
			this.Score = 0;
			this.HitCount = 0;
			//	essentially store a bounding rect for a line
			//	we can clip against this instead of cell
			this.Min = null;	//	[x,y]
			this.Max = null;	//	[x,y]
		}
		
		Increment(Score,x,y)
		{
			this.Score += Score;
			this.HitCount += 1;
			LargestHitCount = Math.max( LargestHitCount, this.HitCount );
			if ( !this.Min )
			{
				this.Min = [x,y];
				this.Max = [x,y];
			}
			this.Min[0] = Math.min( this.Min[0], x );
			this.Min[1] = Math.min( this.Min[1], y );
			this.Max[0] = Math.max( this.Max[0], x );
			this.Max[1] = Math.max( this.Max[1], y );
		}
		
		GetRect()
		{
			const Rect = {};
			Rect.Left = this.Min[0];
			Rect.Right = this.Max[0];
			Rect.Top = this.Min[1];
			Rect.Bottom = this.Max[1];
			Rect.MiddleX = Lerp( Rect.Left, Rect.Right, 0.5 );
			Rect.MiddleY = Lerp( Rect.Top, Rect.Bottom, 0.5 );
			Rect.Width = Rect.Right - Rect.Left;
			Rect.Height = Rect.Bottom - Rect.Top;
			return Rect;
		}
	};
	
	
	//	increment maps where pixel lies
	function OnPixel(x,y,Score,CellAngleRhoHits,CellDim) 
	{
		const Imagex = x;
		const Imagey = y;
		const CellIndex = GetCellIndex(x,y,CellDim);
		CellAngleRhoHits[CellIndex] = CellAngleRhoHits[CellIndex] || new Array(AngleCount);
		const CellRect = GetCellRect(CellIndex,CellDim);
		
		x -= CellRect.MiddleX;
		y -= CellRect.MiddleY;
		
				
		for ( let AngleIndex=0;	AngleIndex<AngleCount;	AngleIndex++ ) 
		{
			let Theta = (AngleIndex/AngleCount) * (Math.PI);
			let rho = x * Math.cos(Theta) + y * Math.sin(Theta);
			rho = Math.floor(rho);
			
			CellAngleRhoHits[CellIndex][AngleIndex] = CellAngleRhoHits[CellIndex][AngleIndex] || [];
			CellAngleRhoHits[CellIndex][AngleIndex][rho] = CellAngleRhoHits[CellIndex][AngleIndex][rho] || new Hit_t(CellIndex);
			CellAngleRhoHits[CellIndex][AngleIndex][rho].Increment( Score, Imagex, Imagey );
		}
	}
	
	
	//	write scores
	function IteratePixels(CellAngleRhoHits,CellDim)
	{
		for ( let y=0;	y<ImageHeight;	y++ )
		{
			for ( let x=0;	x<ImageWidth;	x++ )
			{
				const Score = GetPixelScore(x,y);
				if ( Score > 0 )
				{
					//if ( Score <= 0 )
					//	continue;
					OnPixel(x,y, Score,CellAngleRhoHits,CellDim);
				}
			}
		}
	}


	//	pyramids!
	const CellPyramids = 
	[
		//1,
		3,
		4,
		8,
		16,
		32,
	];

	for ( let CellSize of CellPyramids )
	{
		const CellDim = [CellSize,CellSize];
		//const CellCount = CellSize[0] * CellSize[1];
		const CellAngleRhoHits = new Array( CellDim[0] * CellDim[1] );

		//	extract lines
		IteratePixels( CellAngleRhoHits, CellDim );
		console.log(`LargestHitCount=${LargestHitCount} HitsAllocated=${HitsAllocated}`);
		ExtractHoughLines( CellAngleRhoHits, CellDim );
	}
	
	function NormaliseLineSegment(Line)
	{
		//	oddly makes this more pixel perfefct... css error?
		//	varies on angle count hmm
		Line.Start[0]+=1;
		Line.Start[1]+=1;
		Line.End[0]+=1;
		Line.End[1]+=1;
		
		Line.Start[0] /= ImageWidth;
		Line.Start[1] /= ImageHeight;
		Line.End[0] /= ImageWidth;
		Line.End[1] /= ImageHeight;
		
		return [ Line.Start, Line.End];
	}
	function CompareLineScore(a,b)
	{
		if ( a[3] > b[3] )	return -1;
		if ( a[3] < b[3] )	return 1;
		return 0;
	}
	LineSegments = LineSegments.sort( CompareLineScore );
	LineSegments = LineSegments.map(NormaliseLineSegment);
	//LineSegments = LineSegments.slice(0,1);


	return LineSegments;
}
