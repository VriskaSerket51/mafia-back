export function shuffle(array: any[]) {
    for (let index = array.length - 1; index > 0; index--) {
        // 무작위 index 값을 만든다. (0 이상의 배열 길이 값)
        const randomPosition = Math.floor(Math.random() * (index + 1));

        // 임시로 원본 값을 저장하고, randomPosition을 사용해 배열 요소를 섞는다.
        const temporary = array[index];
        array[index] = array[randomPosition];
        array[randomPosition] = temporary;
    }
}

export function getElCount(array: any[]) {
    return array.reduce((ac, v) => ({ ...ac, [v]: (ac[v] || 0) + 1 }), {});
}
