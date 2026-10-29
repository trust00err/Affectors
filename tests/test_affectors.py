import numpy as np
import pytest

from affectors import AffectionBlock, AffectionBlockClassic, Transformations


def test_classic_block_affect():
    block0 = AffectionBlockClassic(idx=0, base_affection=0.5)
    block1 = AffectionBlockClassic(idx=1, input_blocks=[block0], base_affection=0.3)

    assert block0.affection == 0.5
    assert block1.affection == 1.3  # len(input_blocks) + base_affection

    front = block0.to_front_affect()
    assert front == {}  # у block0 нет исходящих блоков

    block0.out_blocks = [block1]
    assert block0.to_front_affect()[1] > 0  # idx блока-получателя


def test_matrix_block_connections():
    block = AffectionBlock(size=4, epsilon=1e-4, base_affection=1)
    block.set_connections([(0, 1), (0, 2), (2, 3), (1, 3)])
    block.update_affection()

    assert abs(block.blocks_affections[0] - 3) < 1e-6  # 2 связи + base_affection=1
    assert abs(block.blocks_affections[3]) < 1e-6  # без исходящих связей → 0 (base не учитывается)

    back, _ = block.to_back_affect()
    front, _ = block.to_front_affect()
    assert back.shape == front.shape == (4,)

    probs = block.get_probs()
    assert probs.shape == (4, 4)
    assert np.all(np.diagonal(probs) == 0)  # self-связи отключены


def test_transformations():
    t = Transformations()
    assert t.sigmoid(0) == 0.5
    assert t.relu(-1) == 0
    assert t.sigmoid_classic(0) == 0.5
