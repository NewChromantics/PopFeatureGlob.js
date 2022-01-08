export const Frag = `
precision highp float;
varying vec2 FragUv;
#define LumaPlane	InputTexture
#define LumaPlaneWidth	(InputWidthHeight.x)
#define LumaPlaneHeight	(InputWidthHeight.y)
uniform sampler2D InputTexture;
uniform vec2 InputWidthHeight;
//uniform sampler2D BackgroundImage;
const float MaxLumaDiff = 0.10;

#define MAX_ANGLE_COUNT 180
#define RadiusScale 1.0
#define GLOB_RADIUS	20
#define GLOB_MIN_MATCH	0.95
const float GlobRadiusOuterPx = 10.0 * RadiusScale;
const float GlobRadiusMidPx = 5.0 * RadiusScale;
const float GlobRadiusInnerPx = 2.0;
const int MaxIndependentSequence = 5;			//	thicker lines and more angles need to allow more in a sequence
const int LineIndependentsCount = 2;	//	one in, one out, makes a line or a corner
const int TeeIndependentsCount = 3;
const int CrossIndependentsCount = 4;	
//const int AngleCount = 15;	//	one in, one out
const int AngleCount = MAX_ANGLE_COUNT;
#define ANGLE_COUNT AngleCount
const float RotationDeg = 0.0;


#define GlobRadiusOuter		( GlobRadiusOuterPx / LumaPlaneWidth )
#define GlobRadiusMid		( GlobRadiusMidPx / LumaPlaneWidth )
#define GlobRadiusInner		( GlobRadiusInnerPx / LumaPlaneWidth )

//	ray 
#define RAY_MATCH			4
#define RAY_MISMATCH		5

#define GLOB_SOLID			12
#define GLOB_TOO_NOISY		6
#define GLOB_LONER			7
#define GLOB_CORNER			8
#define GLOB_LINE			9
#define GLOB_TEE			10	//	T junction
#define GLOB_CROSS			10	//	+ junction
#define GLOB_EDGE			11	//	pixel between 2 sides
#define GLOB_DEBUGW			0
#define GLOB_LINECAP		GLOB_LONER

vec3 GetGlobColour(float GlobTypef)
{
	int GlobShowOnly = 0;
	int GlobType = int(GlobTypef);
	if ( GlobShowOnly != 0 )
	{
		if ( GlobType == GlobShowOnly )
			return vec3(0,1,0);
		return vec3(0,0,0);
	}
	
	
	if ( GlobType == GLOB_TOO_NOISY )	return vec3(1,0,1);
	if ( GlobType == GLOB_SOLID )		return vec3(0,0,0);
	if ( GlobType == GLOB_LONER )		return vec3(1,0,0);
	
	if ( GlobType == GLOB_CORNER )		return vec3(0,1,1);
	if ( GlobType == GLOB_LINE )		return vec3(1,1,1);
	if ( GlobType == GLOB_TEE )			return vec3(1,1,0);
	if ( GlobType == GLOB_CROSS )		return vec3(1,1,0);
	
	if ( GlobType == GLOB_EDGE )		return vec3(0,0,1);
	
	return vec3(1,0,1);
}	

float GetLuma(vec3 Rgb)
{
	return Rgb.x;
	float Average = (Rgb.x + Rgb.y + Rgb.z) / 3.0;
	return Average;
}

bool Glob_IsColourMatch(vec2 TestColourUv,vec3 BaseColour,sampler2D ColourSource)
{
	vec3 ColourTest = texture2D( ColourSource, TestColourUv ).xyz;

	float LumaA = GetLuma( BaseColour );
	float LumaB = GetLuma( ColourTest );
	float LumaDiff = abs( LumaA - LumaB );
	return ( LumaDiff <= MaxLumaDiff );
}


//	calculate the glob feature
//	x = u
//	y = v
//	z = type
//	w = firstangle
vec4 CalculateGlobFeature(vec2 uv,sampler2D ColourSource,out vec3 FeatureRays[MAX_ANGLE_COUNT])
{
	//	double size so we can check the opposite without modulus index
	bool RingMatches[MAX_ANGLE_COUNT*2];
	float LastMatch = 0.0;
	
	//	simplify for now by only matching against white
	//vec4 BaseColour = texture2D( ColourSource, uv );
	vec3 BaseColour = vec3(1,1,1);
	int RingMatchCount = 0;
	
	//	calc offset
	for ( int a=0;	a<ANGLE_COUNT;	a++ )
	{
		float AngleNorm = float(a) / float(ANGLE_COUNT);
		float AngleDeg = mix( 0.0, 360.0, AngleNorm ) + RotationDeg;
		float AngleRad = radians( AngleDeg );
		vec2 Offset = vec2( cos(AngleRad), sin(AngleRad) );
		vec2 OuterUv = uv + Offset * GlobRadiusOuter;
		vec2 MidUv = uv + Offset * GlobRadiusMid;
		vec2 InnerUv = uv + Offset * GlobRadiusInner;
		FeatureRays[a].xy = OuterUv;
		FeatureRays[a].z = float(RAY_MISMATCH);
		RingMatches[a] = true;
		
		int MatchCount = 0;
		const int StepSize = 1;
		for ( int Step=1;	Step<GLOB_RADIUS;	Step+=StepSize )
		{
			vec2 StepUv = uv + (Offset * (float(Step) / LumaPlaneWidth) ); 
			MatchCount += Glob_IsColourMatch( StepUv, BaseColour, ColourSource ) ? StepSize : 0;
		}
		bool Hit = float(MatchCount)/float(GLOB_RADIUS-1) > GLOB_MIN_MATCH;
		RingMatches[a] = Hit;
		RingMatchCount += Hit ? 1 : 0;
		/*
		if ( Glob_IsColourMatch( OuterUv, BaseColour, ColourSource ) )
		{
			if ( Glob_IsColourMatch( MidUv, BaseColour, ColourSource ) )
			{
				if ( Glob_IsColourMatch( InnerUv, BaseColour, ColourSource ) )
				{
					FeatureRays[a].z = float(RAY_MATCH);
					RingMatches[a] = true;
					LastMatch = float(a);
				}
			}
		}
		*/
		//	copy value to the opposite
		RingMatches[a+ANGLE_COUNT] = RingMatches[a];
	}
	
	if ( RingMatchCount == 0 )
		return vec4( uv, float(GLOB_SOLID), 0.0 );

/*
	if ( RingMatchCount == 1 )
		return vec4( uv, float(GLOB_DEBUGW), 0.5 );

	if ( RingMatchCount == 2 )
		return vec4( uv, float(GLOB_DEBUGW), 0.9 );

	float Score = float(RingMatchCount-1) / float(ANGLE_COUNT); 
	return vec4( uv, float(GLOB_DEBUGW), Score );
*/
	
	//	compress into groups of lines
	#define MAX_LINES	4
	int LineCount = 0;
	int SequenceCount = 0;
	int MinSequenceLength = 1;
	int MaxSequenceLength = 20;	//	variable on angle count, and length of glob (longer = less hits)
	bool HasOpposite = false;	//	doesnt matter which line has an opposite
	bool SequenceHasOpposite = false;
	
	for ( int i=0;	i<ANGLE_COUNT;	i++)
	{
		if ( RingMatches[i] )
		{
			SequenceCount++;
			
			#define OPPOSITE_RANGE	1
			for ( int o=-OPPOSITE_RANGE;	o<=OPPOSITE_RANGE;	o++ )
				SequenceHasOpposite = SequenceHasOpposite || RingMatches[i+o+(ANGLE_COUNT/2)];
		}
		else//	break sequence
		{
			//	was just iterating a line
			if ( SequenceCount >= MinSequenceLength )
			{
				if ( SequenceCount <= MaxSequenceLength )
				{
					LineCount++;
					HasOpposite = HasOpposite || SequenceHasOpposite;
				}
			}
			SequenceCount = 0;
			SequenceHasOpposite = false;
		}
	}
	//	todo: loop around, and handle last angle properly
	

	//return vec4( uv, float(GLOB_DEBUGW), float(LineCount-1)/float(MAX_LINES) );
	if ( LineCount == 0 )
		return vec4( uv, float(GLOB_SOLID), 0.0 );

	//	end of a line
	if ( LineCount == 1 )
	{
		//return vec4( uv, float(GLOB_SOLID), 0.0 );
		return vec4( uv, float(GLOB_LINECAP), 0.0 );
	}

	//	straight line
	if ( LineCount == 2 && HasOpposite )
	{
		//return vec4( uv, float(GLOB_SOLID), 0.0 );
		return vec4( uv, float(GLOB_LINE), 0.3 );
	}

	//	corner
	if ( LineCount == 2 && !HasOpposite )
		return vec4( uv, float(GLOB_CORNER), 0.6 );

	//	T/join/cross
	if ( LineCount >= 3 )
		return vec4( uv, float(GLOB_TEE), 0.9 );

	return vec4( uv, float(GLOB_SOLID), 0.0 );
	return vec4( uv, float(GLOB_DEBUGW), 1.9 );
	
	/*
		//	new version, squash down sets of matches
	//	once we go over a certain amount, its just noise (or a star)
	#define MAX_SEQ		20
	//int SeqSizes[MAX_SEQ];
	int SeqIndex = 0;
	bool SeqMatch = RingMatches[0];
	//SeqSizes[SeqIndex] = 0;
	int MatchWidth = 0;
	
	for ( int i=0;	i<ANGLE_COUNT;	i++)
	{
		if ( RingMatches[i] == SeqMatch )
		{
			//SeqSizes[SeqIndex]++;
			if ( SeqMatch )
				MatchWidth++;
		}
		else
		{
			//	broken sequence
			SeqIndex++;
			if ( SeqIndex >= MAX_SEQ )
				break;
			//SeqSizes[SeqIndex] = 1;
			SeqMatch = RingMatches[i];
		}
	}
	//	loop around
	if ( SeqIndex > 1 )
	{
		if ( RingMatches[0] == RingMatches[ANGLE_COUNT-1] )
		{
			//SeqSizes[0] += SeqSizes[SeqIndex];
			SeqIndex--;
		}
	}
	
	bool ChunkyLines = float(MatchWidth)/float(ANGLE_COUNT) > 0.2;
	
	int SeqCount = SeqIndex+1;
	
	//	1 big colour
	if ( SeqCount == 1 )
		return vec4( uv, float(GLOB_SOLID), float(SeqCount-1)/float(MAX_SEQ) );
	
	//if ( ChunkyLines )	return vec4( uv, float(GLOB_SOLID), float(SeqCount-1)/float(MAX_SEQ) );
		
	//	visualise (sum of) width of lines
	//return vec4( uv, float(GLOB_DEBUGW), float(MatchWidth)/float(ANGLE_COUNT) );
	
	//	2 and thick means edge
	//if ( SeqCount == 2 )//&& MatchWidth >= ChunkyWidth )
	//	return vec4( uv, float(GLOB_EDGE), float(SeqCount-1)/float(MAX_SEQ) );

	if ( SeqCount != 2 )
		return vec4( uv, float(GLOB_SOLID), float(SeqCount-1)/float(MAX_SEQ) );


	//	2 and thin means end of a line
	if ( SeqCount == 2 )
		return vec4( uv, float(GLOB_LINECAP), float(SeqCount-1)/float(MAX_SEQ) );
	
	//	4 is line
	//if ( SeqCount != 4 )
	//	return vec4( uv, float(GLOB_SOLID), float(SeqCount-1)/float(MAX_SEQ) );
	
	return vec4( uv, float(GLOB_DEBUGW), float(SeqCount-1)/float(MAX_SEQ) );
	
	//if ( SeqCount >= NOISE_SEQ )
	//	return vec4( uv, float(GLOB_TOO_NOISY), 0.0 );
	
	//	surrounded by same as us
	if ( SeqCount == 1 && RingMatches[0] )
		return vec4( uv, float(GLOB_SOLID), 0.0 );
		
	//	surrounded by not same as us
	if ( SeqCount == 1 && !RingMatches[0] )
		return vec4( uv, float(GLOB_LONER), 0.0 );
	
	//	two sides
	if ( SeqCount == 2 )
		return vec4( uv, float(GLOB_EDGE), 1.0 );
	
	//	could be line, etc
	return vec4( uv, float(GLOB_LINE), 0.0 );

	
	//	now calc score
	//	count how many independent matches (sets of matches) we get
	//	independent match is N matches in sequence
	//	where N(MaxSequence) increases, we allow thicker lines
	int Independents = 0;
	int Blocks = 0;
	int MatchCounter = 0;
	int LastIndepdent = 0;
	bool HasOpposite = false;
	
	for ( int i=0;	i<ANGLE_COUNT;	i++)
	{
		if ( RingMatches[i] )
		{
			MatchCounter++;
		}
		else
		{
			if ( MatchCounter > MaxIndependentSequence )
			{
				Blocks++;
			}
			else if ( MatchCounter > 0 )
			{
				Independents++;
				LastIndepdent = i-1;
				
				//HasOpposite = HasOpposite || RingMatches[ i-1 + (ANGLE_COUNT / 2) ];
				HasOpposite = HasOpposite || RingMatches[ i+0 + (ANGLE_COUNT / 2) ];
				//HasOpposite = HasOpposite || RingMatches[ i+1 + (ANGLE_COUNT / 2) ];
			}
			MatchCounter = 0;
		}
	}
	//	finish
	if ( MatchCounter > MaxIndependentSequence )
		Blocks++;
	else if ( MatchCounter > 0 )
		Independents++;
	
	float FirstAngle = LastMatch / float(ANGLE_COUNT);
	
	//	any blocks = too noisy (better for solid block edges, not lines)
	
	if ( Blocks > 0 )
		return vec4( uv, float(GLOB_TOO_NOISY), FirstAngle );
	
		
	if ( Independents == 0 )
		return vec4( uv, float(GLOB_LONER), FirstAngle );
	
	//	only one exit line, so we're edge of a line
	if ( Independents == 1 )
		return vec4( uv, float(GLOB_CORNER), FirstAngle );
	
	//	detect a line
	if ( Independents == LineIndependentsCount )
	{
		//	if the opposite side of the ring is a match, we're a line
		//	may need +- 1 tolerance here
		
		 int MatchIndepdent = (LastIndepdent + ANGLE_COUNT / 2);
		 if ( MatchIndepdent >= ANGLE_COUNT )
		 MatchIndepdent -= ANGLE_COUNT;
		
		if ( HasOpposite )
			return vec4( uv, float(GLOB_LINE), FirstAngle );
		
		return vec4( uv, float(GLOB_CORNER), FirstAngle );
	}
	
	if ( Independents == TeeIndependentsCount || Independents == CrossIndependentsCount )
	{
		//	need at least 1 opposite to be a T
		//if ( OppositeIndepdentMinus || OppositeIndepdentEqual || OppositeIndepdentPlus )
			return vec4( uv, float(GLOB_TEE), FirstAngle );
	}

	//	too many corners
	return vec4( uv, float(GLOB_TOO_NOISY), FirstAngle );
	*/
}


const vec3 Zoom = vec3(0,0,1);

vec2 ApplyZoom(vec2 uv)
{
	//	center and scale
	uv -= 0.5;
	uv /= Zoom.z;
	uv += 0.5;
	//	pan
	uv += Zoom.xy * ( 1.0 / Zoom.z );
	return uv;
}


vec2 MakeUvBlocky(vec2 uv)
{
	return uv;
	float Units = 400.0;
	uv *= Units;
	uv = floor(uv);
	uv /= Units;
	
	return uv;
}


float Range(float Min,float Max,float Value)
{
	return (Value-Min) / (Max-Min);
}

vec3 NormalToRedGreenBlue(float Normal)
{
	if ( Normal < 0.0 )
	{
		return vec3(0,0,0);
	}
	else if ( Normal < 0.25 )
	{
		Normal = Range( 0.0, 0.25, Normal );
		return vec3( 1, Normal, 0 );
	}
	else if ( Normal <= 0.5 )
	{
		Normal = Range( 0.25, 0.50, Normal );
		return vec3( 1.0-Normal, 1, 0 );
	}
	else if ( Normal <= 0.75 )
	{
		Normal = Range( 0.50, 0.75, Normal );
		return vec3( 0, 1, Normal );
	}
	else if ( Normal <= 1.0 )
	{
		Normal = Range( 0.75, 1.00, Normal );
		return vec3( 0, 1.0-Normal, 1 );
	}

	//	>1
	return vec3( 1,1,1 );
}

void main()
{
	vec2 TextureUv = ApplyZoom( FragUv );
	vec2 SampleUv = MakeUvBlocky(TextureUv);
	vec4 Colour4 = texture2D( LumaPlane, SampleUv );
	vec3 Colour = Colour4.xyz;
	
	gl_FragColor = vec4( Colour,1 );
	if ( Colour4.w < 0.5 )
	{
		gl_FragColor = Colour4;
		return;
	}
	//return;
	//gl_FragColor = texture2D( BackgroundImage, SampleUv ).xxxw;
	
	//Colour = vec3(0,0,0);
	vec3 FeatureHereRays[MAX_ANGLE_COUNT];
	vec4 FeatureHere = CalculateGlobFeature( SampleUv, LumaPlane, FeatureHereRays );
	
	gl_FragColor.w = 1.0;

	if ( int(FeatureHere.z) == GLOB_SOLID )
	{
		gl_FragColor.xyz = vec3(0,0,0);
		return;
	}
	/*
	if ( int(FeatureHere.z) == GLOB_LONER )
	{
		gl_FragColor.xyz = vec3(1,1,1);
		return;
	}
	if ( int(FeatureHere.z) == GLOB_EDGE )
	{
		gl_FragColor.xyz = vec3(0,0,0);
		return;
	}
	*/
	
	if ( int(FeatureHere.z) == GLOB_DEBUGW )
	{
		gl_FragColor.xyz = NormalToRedGreenBlue( FeatureHere.w );
		return;
	}

	
	Colour = GetGlobColour(FeatureHere.z);
	
	if ( int(FeatureHere.z) == GLOB_LINE )
	{
		//	angle
		//Colour = NormalToRedGreen( FeatureHere.w );
	}
	
	gl_FragColor.xyz = Colour;
	gl_FragColor.w = 1.0;
}


`;
export default Frag;
