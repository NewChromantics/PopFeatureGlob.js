export const Frag = `

precision highp float;
varying vec2 FragUv;
uniform sampler2D InputTexture;
uniform vec2 InputWidthHeight;

const int SearchSize = 10;

float GetBestNeighbourScore()
{
	float BestScore = 0.0;
	
	for ( int y=-SearchSize;	y<=SearchSize;	y++ )
	{
		for ( int x=-SearchSize;	x<=SearchSize;	x++ )
		{
			if ( x==0 && y==0 )				
				continue;
			vec2 uv = vec2( x, y ) / InputWidthHeight;
			uv += FragUv;
			vec4 Sample = texture2D( InputTexture, uv );
			float Score = Sample.w;
			BestScore = max( Score, BestScore );
		}
	}
	return BestScore;
}



void main()
{
	float NeighbourScore = GetBestNeighbourScore();
	float ThisScore = texture2D( InputTexture, FragUv ).w;
	
	gl_FragColor = vec4(0,0,0,0);
	if ( ThisScore > NeighbourScore )
		gl_FragColor = vec4(ThisScore,ThisScore,ThisScore,ThisScore);
}

`;

export default Frag;
