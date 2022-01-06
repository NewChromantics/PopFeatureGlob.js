export const Frag = `
precision highp float;
varying vec2 FragUv;
#define LumaPlane	InputTexture
#define LumaPlaneWidth	(InputWidthHeight.x)
#define LumaPlaneHeight	(InputWidthHeight.y)
uniform sampler2D InputTexture;
uniform vec2 InputWidthHeight;
//uniform sampler2D BackgroundImage;
const float MaxLumaDiff = 0.14;

#define MAX_ANGLE_COUNT 90
#define RadiusScale 0.5
const float GlobRadiusOuterPx = 14.0 * RadiusScale;
const float GlobRadiusMidPx = 8.0 * RadiusScale;
const float GlobRadiusInnerPx = 4.0 * RadiusScale;
const int MaxIndependentSequence = MAX_ANGLE_COUNT/10;			//	thicker lines and more angles need to allow more in a sequence
const int LineIndependentsCount = 2;	//	one in, one out
const int TeeIndependentsCount = 3;
const int CrossIndependentsCount = 4;	
//const int AngleCount = 15;	//	one in, one out
const int AngleCount = MAX_ANGLE_COUNT;	//	one in, one out
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

vec3 GetGlobColour(float GlobTypef)
{
	int GlobShowOnly = GLOB_LINE;
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

float GetLuma(vec4 Rgba)
{
	float Average = (Rgba.x + Rgba.y + Rgba.z) / 3.0;
	return Average;
	return Rgba.x;
}

bool Glob_IsColourMatch(vec2 uvA,vec2 uvB,sampler2D ColourSource)
{
	vec4 ColourA = texture2D( ColourSource, uvA );
	vec4 ColourB = texture2D( ColourSource, uvB );
	
	bool ValidA = (ColourA.w > 0.5);
	bool ValidB = (ColourB.w > 0.5);
	if ( !ValidA || !ValidB )
		return false;
		
	float LumaA = GetLuma( ColourA );
	float LumaB = GetLuma( ColourB );
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
		RingMatches[a] = false;
		
		if ( Glob_IsColourMatch( OuterUv, uv, ColourSource ) )
		{
			if ( Glob_IsColourMatch( MidUv, uv, ColourSource ) )
			{
				if ( Glob_IsColourMatch( InnerUv, uv, ColourSource ) )
				{
					FeatureRays[a].z = float(RAY_MATCH);
					RingMatches[a] = true;
					LastMatch = float(a);
				}
			}
		}
		
		//	copy value to the opposite
		RingMatches[a+ANGLE_COUNT] = RingMatches[a];
	}
	
	
	
	//	new version, squash down sets of matches
	//	once we go over a certain amount, its just noise (or a star)
	#define MAX_SEQ		(NOISE_SEQ+1)
	#define NOISE_SEQ	6
	//int SeqSizes[MAX_SEQ];
	int SeqIndex = 0;

	bool SeqMatch = RingMatches[0];
	//SeqSizes[SeqIndex] = 0;
	
	for ( int i=0;	i<ANGLE_COUNT;	i++)
	{
		if ( RingMatches[i] == SeqMatch )
		{
			//SeqSizes[SeqIndex]++;
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
		if ( SeqMatch == RingMatches[0] )
		{
			//SeqSizes[0] += SeqSizes[SeqIndex];
			SeqIndex--;
		}
	}
	
	int SeqCount = SeqIndex+1;
	
	if ( SeqCount >= NOISE_SEQ )
		return vec4( uv, float(GLOB_TOO_NOISY), 0.0 );
		
	if ( SeqCount == 1 && RingMatches[0] )
		return vec4( uv, float(GLOB_SOLID), 0.0 );
	if ( SeqCount == 1 && !RingMatches[0] )
		return vec4( uv, float(GLOB_LONER), 0.0 );
	//	two sides
	if ( SeqCount == 2 )
		return vec4( uv, float(GLOB_EDGE), 0.0 );
	
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
	bool OppositeIndepdentMinus = false;
	bool OppositeIndepdentEqual = false;
	bool OppositeIndepdentPlus = false;
	
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
				
				OppositeIndepdentMinus = RingMatches[ i-1 + (ANGLE_COUNT / 2) ];
				OppositeIndepdentEqual = RingMatches[ i+0 + (ANGLE_COUNT / 2) ];
				OppositeIndepdentPlus = RingMatches[ i+1 + (ANGLE_COUNT / 2) ];
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
	
	//	detect a line
	if ( Independents == LineIndependentsCount )
	{
		//	if the opposite side of the ring is a match, we're a line
		//	may need +- 1 tolerance here
		/*
		 int MatchIndepdent = (LastIndepdent + ANGLE_COUNT / 2);
		 if ( MatchIndepdent >= ANGLE_COUNT )
		 MatchIndepdent -= ANGLE_COUNT;
		 */
		if ( OppositeIndepdentMinus || OppositeIndepdentEqual || OppositeIndepdentPlus )
		//if ( OppositeIndepdentEqual )
			return vec4( uv, float(GLOB_LINE), FirstAngle );
		
		return vec4( uv, float(GLOB_CORNER), FirstAngle );
	}
	
	if ( Independents == TeeIndependentsCount || Independents == CrossIndependentsCount )
	{
		//	need at least 1 opposite to be a T
		if ( OppositeIndepdentMinus || OppositeIndepdentEqual || OppositeIndepdentPlus )
			return vec4( uv, float(GLOB_TEE), FirstAngle );
	}

	//	too many corners
	return vec4( uv, float(GLOB_TOO_NOISY), FirstAngle );
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


vec3 NormalToRedGreen(float Normal)
{
	if ( Normal < 0.5 )
	{
		Normal = Normal / 0.5;
		return vec3( 1, Normal, 0 );
	}
	else if ( Normal <= 1.0 )
	{
		Normal = (Normal-0.5) / 0.5;
		return vec3( 1.0-Normal, 1, 0 );
	}
	
	//	>1
	return vec3( 0,0,1 );
}


void main()
{
	vec2 TextureUv = ApplyZoom( FragUv );
	vec2 SampleUv = MakeUvBlocky(TextureUv);
	vec3 Colour = texture2D( LumaPlane, SampleUv ).xyz;
	
	gl_FragColor = vec4( 0,0,0,0 );
	//gl_FragColor = texture2D( BackgroundImage, SampleUv ).xxxw;
	
	//Colour = vec3(0,0,0);
	vec3 FeatureHereRays[MAX_ANGLE_COUNT];
	vec4 FeatureHere = CalculateGlobFeature( SampleUv, LumaPlane, FeatureHereRays );
	
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
